# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Overview

`@manifestdocs/mcp` is a standalone MCP server that exposes 27 Manifest tools. It supports a stdio entry point for local agents and a Cloudflare Worker HTTP transport for the hosted MCP subdomain.

## Build & Test

```bash
pnpm install                    # Install dependencies
pnpm build                      # Compile TypeScript (src/ -> dist/)
pnpm test                       # Run tests in watch mode
pnpm test:run                   # Run tests once (CI)
pnpm check                      # Type-check without emitting
```

## Architecture

- **`src/index.ts`** — CLI entry point: creates server, connects stdio transport
- **`src/http.ts`** — HTTP Worker adapter: WorkOS/AuthKit challenge flow + MCP streamable HTTP
- **`src/worker.ts`** — Cloudflare Worker entry point
- **`src/server.ts`** — `createServer()`: registers 27 tools with zod schemas, delegates to handlers
- **`src/types.ts`** — Domain types (copied from manifest-pi, zero dependencies)
- **`src/client.ts`** — HTTP client wrapping fetch() with typed methods
- **`src/format.ts`** — Text rendering (trees, tables, state symbols, time buckets)
- **`src/tools/*.ts`** — Pure handler functions: `(client, params) => Promise<string>`

## Conventions

- **Zod schemas** for all tool parameters (required by MCP SDK)
- **`agent_type: "claude"`** default for feature claims
- **Default server URL**: `http://localhost:4242` (SvelteKit dev server)
- Tool names do not repeat the server namespace prefix (for example `start_feature`, not `manifest_start_feature`)

## Configuration

Environment variables:
- `MANIFEST_URL` — Server URL (default: `http://localhost:4242`)
- `MANIFEST_API_KEY` — Optional API key for authenticated servers
- `MANIFEST_API_BASE_URL` — Hosted MCP Worker target API base URL
- `WORKOS_AUTHKIT_DOMAIN` — AuthKit issuer/domain for hosted MCP auth

## Claude Code Integration

Add to MCP config:
```json
{
  "mcpServers": {
    "manifest": {
      "command": "node",
      "args": ["/path/to/manifest-mcp/dist/index.js"]
    }
  }
}
```
