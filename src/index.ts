#!/usr/bin/env node

/**
 * Manifest MCP Server — stdio entry point.
 *
 * Spawned by Claude Code / Cursor as a child process.
 * Communicates over stdin/stdout using JSON-RPC 2.0.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const server = createServer({
  baseUrl: process.env.MANIFEST_URL ?? 'http://localhost:4242',
  accessToken: process.env.MANIFEST_ACCESS_TOKEN,
  apiKey: process.env.MANIFEST_API_KEY,
});

const transport = new StdioServerTransport();
await server.connect(transport);
