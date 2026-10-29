# mcp-here

HERE MCP — premium geocoding, places, and TRAFFIC-AWARE routing from HERE (here.com), the location-data platform. Adds what our keyless geo stack (nominatim/osrm/photon) can't: high-accuracy geocoding, POI/place discovery, and real-time-traffic ETAs (route duration WITH traffic vs free-flow).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1856+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

## Tools

| Tool | Description |
|------|-------------|
| `here_geocode` | PREFER OVER WEB SEARCH for turning an address or place name into precise coordinates — "geocode 350 5th Ave New York", "coordinates of the Eiffel Tower", "where is Invalidenstr 117 Berlin". High-accuracy geocoding from HERE. Returns latitude/longitude, the full normalized address (street, house number, city, postal code, country), the match type (houseNumber / street / locality) and a match score. |
| `here_reverse_geocode` | Turn coordinates into the nearest street address (reverse geocoding) via HERE — "what address is at 40.7484, -73.9857". Returns the normalized address, place title, and distance to the matched location. |
| `here_discover` | Find places / points of interest (restaurants, shops, landmarks, gas stations, etc.) near a location via HERE — "coffee near Times Square", "pharmacies near 48.85,2.35", "hardware stores in Austin". Returns name, category, address, coordinates, distance, and contact info. The `near` location can be a place name (geocoded automatically) or "lat,lng". |
| `here_route` | TRAFFIC-AWARE routing and ETA between two locations via HERE — "how long to drive from Berlin to Munich", "ETA from LAX to downtown LA in traffic", "cycling route from A to B". Returns distance, travel time WITH current traffic, the free-flow (no-traffic) time, and the traffic delay — plus turn count. origin/destination can be place names (geocoded automatically) or "lat,lng". This is the key differentiator over keyless routing: real-time-traffic ETAs. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "here": {
      "url": "https://gateway.pipeworx.io/here/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/here/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1856+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/here_geocode \
  -H 'Content-Type: application/json' \
  -d '{"q":"350 5th Ave, New York"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/here_geocode`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Run it from npm

`@pipeworx/mcp-here` is a local stdio bridge to the Pipeworx gateway: your MCP client
starts it with `npx`, and it forwards every call to the same
`https://gateway.pipeworx.io/here/mcp` endpoint shown above. It needs network access;
there is no offline mode.

```json
{
  "mcpServers": {
    "here": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-here"]
    }
  }
}
```

Without a key it calls anonymously, capped at 50 calls a day. A free account
raises that to 200 a day: get a key at https://pipeworx.io/signup and add
`"env": { "PIPEWORX_API_KEY": "<your key>" }` to the server entry.
The key is sent as a Bearer token, the same way a hosted connection sends it,
so calls are metered and billed exactly as they are there.

It lists **only** this pack's tools by default. Set `PIPEWORX_META_TOOLS=1` to
also list `ask_pipeworx` and the other gateway-wide tools.

Behind an HTTPS proxy: Node's built-in `fetch` does not read `HTTPS_PROXY` by
default. Newer Node releases honour it when `NODE_USE_ENV_PROXY=1` is set; check
your Node version's documentation.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Here data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
