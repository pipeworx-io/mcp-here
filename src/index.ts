interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * HERE MCP — premium geocoding, places, and TRAFFIC-AWARE routing from HERE
 * (here.com), the location-data platform. Adds what our keyless geo stack
 * (nominatim/osrm/photon) can't: high-accuracy geocoding, POI/place discovery,
 * and real-time-traffic ETAs (route duration WITH traffic vs free-flow).
 *
 * Auth: HERE REST API key via `?apiKey=`. Platform key injected by the gateway
 * as `_apiKey` (PLATFORM_HERE_KEY); BYO via `?_apiKey=<key>` (free at
 * platform.here.com — 250k txns/mo free). Endpoints are per-service subdomains.
 */


const GEOCODE = 'https://geocode.search.hereapi.com/v1/geocode';
const REVGEOCODE = 'https://revgeocode.search.hereapi.com/v1/revgeocode';
const DISCOVER = 'https://discover.search.hereapi.com/v1/discover';
const ROUTER = 'https://router.hereapi.com/v8/routes';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const TRANSPORT_MODES = ['car', 'truck', 'pedestrian', 'bicycle', 'scooter'];

const tools: McpToolExport['tools'] = [
  {
    name: 'here_geocode',
    description:
      'PREFER OVER WEB SEARCH for turning an address or place name into precise coordinates — "geocode 350 5th Ave New York", "coordinates of the Eiffel Tower", "where is Invalidenstr 117 Berlin". High-accuracy geocoding from HERE. Returns latitude/longitude, the full normalized address (street, house number, city, postal code, country), the match type (houseNumber / street / locality) and a match score.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Free-form address or place, e.g. "350 5th Ave, New York" or "Eiffel Tower, Paris".' },
        country: { type: 'string', description: 'Optional ISO-3 country code to bias/limit, e.g. "USA", "DEU", "FRA".' },
        limit: { type: 'number', description: 'Max results (default 5, max 20).' },
      },
      required: ['q'],
    },
  },
  {
    name: 'here_reverse_geocode',
    description:
      'Turn coordinates into the nearest street address (reverse geocoding) via HERE — "what address is at 40.7484, -73.9857". Returns the normalized address, place title, and distance to the matched location.',
    inputSchema: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: 'Latitude, e.g. 40.7484.' },
        lng: { type: 'number', description: 'Longitude, e.g. -73.9857.' },
      },
      required: ['lat', 'lng'],
    },
  },
  {
    name: 'here_discover',
    description:
      'Find places / points of interest (restaurants, shops, landmarks, gas stations, etc.) near a location via HERE — "coffee near Times Square", "pharmacies near 48.85,2.35", "hardware stores in Austin". Returns name, category, address, coordinates, distance, and contact info. The `near` location can be a place name (geocoded automatically) or "lat,lng".',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for, e.g. "coffee", "pharmacy", "hardware store".' },
        near: { type: 'string', description: 'Place name (e.g. "Times Square, New York") or "lat,lng" (e.g. "40.758,-73.985") to search around.' },
        limit: { type: 'number', description: 'Max results (default 10, max 50).' },
      },
      required: ['query', 'near'],
    },
  },
  {
    name: 'here_route',
    description:
      'TRAFFIC-AWARE routing and ETA between two locations via HERE — "how long to drive from Berlin to Munich", "ETA from LAX to downtown LA in traffic", "cycling route from A to B". Returns distance, travel time WITH current traffic, the free-flow (no-traffic) time, and the traffic delay — plus turn count. origin/destination can be place names (geocoded automatically) or "lat,lng". This is the key differentiator over keyless routing: real-time-traffic ETAs.',
    inputSchema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Start — place name (e.g. "LAX airport") or "lat,lng".' },
        destination: { type: 'string', description: 'End — place name (e.g. "downtown Los Angeles") or "lat,lng".' },
        transport_mode: { type: 'string', description: `car (default) | truck | pedestrian | bicycle | scooter.` },
      },
      required: ['origin', 'destination'],
    },
  },
];

interface HereAddress {
  label?: string; countryCode?: string; countryName?: string; state?: string;
  city?: string; district?: string; street?: string; postalCode?: string; houseNumber?: string;
}
interface HereItem {
  title?: string; id?: string; resultType?: string;
  position?: { lat: number; lng: number };
  address?: HereAddress; distance?: number;
  categories?: { name?: string; primary?: boolean }[];
  contacts?: { phone?: { value?: string }[]; www?: { value?: string }[] }[];
  scoring?: { queryScore?: number };
}

async function hereGet(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (res.status === 401 || res.status === 403) throw new Error('HERE: invalid or unauthorized API key.');
  if (res.status === 429) throw new Error('HERE: rate-limit (HTTP 429) — free tier is 250k txns/mo.');
  if (!res.ok) throw new Error(`HERE API error: ${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.json() as Promise<Record<string, unknown>>;
}

function shapeAddress(a: HereAddress | undefined) {
  if (!a) return null;
  return {
    label: a.label ?? null, house_number: a.houseNumber ?? null, street: a.street ?? null,
    city: a.city ?? null, state: a.state ?? null, postal_code: a.postalCode ?? null,
    country: a.countryName ?? a.countryCode ?? null,
  };
}

// Resolve a place name or "lat,lng" string to "lat,lng" for HERE `at`/waypoint params.
async function resolveLoc(input: string, apiKey: string): Promise<string> {
  const s = input.trim();
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (m) return `${m[1]},${m[2]}`;
  const data = await hereGet(`${GEOCODE}?q=${encodeURIComponent(s)}&limit=1&apiKey=${apiKey}`);
  const item = ((data.items as HereItem[]) ?? [])[0];
  if (!item?.position) throw new Error(`Could not geocode "${input}" — try a more specific place name or pass "lat,lng".`);
  return `${item.position.lat},${item.position.lng}`;
}

function reqStr(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Required argument "${key}" is missing.`);
  return v.trim();
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = (args._apiKey as string | undefined)?.trim();
  delete args._apiKey;
  if (!apiKey) {
    throw new Error('HERE requires an API key. Contact the operator about platform credentials, or BYO via ?_apiKey=<key> (free at https://platform.here.com — 250k transactions/month free).');
  }

  switch (name) {
    case 'here_geocode': {
      const q = reqStr(args, 'q');
      const limit = Math.min(20, Math.max(1, (args.limit as number) ?? 5));
      const inCountry = typeof args.country === 'string' && args.country.trim() ? `&in=countryCode:${encodeURIComponent(args.country.trim().toUpperCase())}` : '';
      const data = await hereGet(`${GEOCODE}?q=${encodeURIComponent(q)}&limit=${limit}${inCountry}&apiKey=${apiKey}`);
      const items = ((data.items as HereItem[]) ?? []).map((i) => ({
        title: i.title ?? null,
        position: i.position ?? null,
        match_type: i.resultType ?? null,
        match_score: i.scoring?.queryScore ?? null,
        address: shapeAddress(i.address),
      }));
      return { query: q, count: items.length, results: items };
    }
    case 'here_reverse_geocode': {
      const lat = args.lat, lng = args.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') throw new Error('here_reverse_geocode requires numeric "lat" and "lng".');
      const data = await hereGet(`${REVGEOCODE}?at=${lat},${lng}&limit=1&apiKey=${apiKey}`);
      const item = ((data.items as HereItem[]) ?? [])[0];
      if (!item) return { found: false, at: { lat, lng }, message: 'No address found near those coordinates.' };
      return { found: true, at: { lat, lng }, title: item.title ?? null, distance_m: item.distance ?? null, address: shapeAddress(item.address) };
    }
    case 'here_discover': {
      const query = reqStr(args, 'query');
      const at = await resolveLoc(reqStr(args, 'near'), apiKey);
      const limit = Math.min(50, Math.max(1, (args.limit as number) ?? 10));
      const data = await hereGet(`${DISCOVER}?q=${encodeURIComponent(query)}&at=${at}&limit=${limit}&apiKey=${apiKey}`);
      const items = ((data.items as HereItem[]) ?? []).map((i) => ({
        title: i.title ?? null,
        category: i.categories?.find((c) => c.primary)?.name ?? i.categories?.[0]?.name ?? null,
        address: i.address?.label ?? null,
        position: i.position ?? null,
        distance_m: i.distance ?? null,
        phone: i.contacts?.[0]?.phone?.[0]?.value ?? null,
        website: i.contacts?.[0]?.www?.[0]?.value ?? null,
      }));
      return { query, near: at, count: items.length, places: items };
    }
    case 'here_route': {
      const mode = TRANSPORT_MODES.includes(String(args.transport_mode)) ? String(args.transport_mode) : 'car';
      const origin = await resolveLoc(reqStr(args, 'origin'), apiKey);
      const destination = await resolveLoc(reqStr(args, 'destination'), apiKey);
      const data = await hereGet(
        `${ROUTER}?transportMode=${mode}&origin=${origin}&destination=${destination}&return=summary&apiKey=${apiKey}`,
      );
      const route = ((data.routes as { sections?: { summary?: { duration?: number; baseDuration?: number; length?: number }; actions?: unknown[] }[] }[]) ?? [])[0];
      const sections = route?.sections ?? [];
      if (!sections.length) return { found: false, origin, destination, message: 'No route found between those points for this transport mode.' };
      const dur = sections.reduce((s, x) => s + (x.summary?.duration ?? 0), 0);
      const base = sections.reduce((s, x) => s + (x.summary?.baseDuration ?? 0), 0);
      const len = sections.reduce((s, x) => s + (x.summary?.length ?? 0), 0);
      return {
        found: true, transport_mode: mode, origin, destination,
        distance_m: len, distance_km: Number((len / 1000).toFixed(2)),
        duration_s: dur, duration_min: Number((dur / 60).toFixed(1)),
        duration_in_traffic_min: Number((dur / 60).toFixed(1)),
        free_flow_min: base ? Number((base / 60).toFixed(1)) : null,
        traffic_delay_min: base ? Number(((dur - base) / 60).toFixed(1)) : null,
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
