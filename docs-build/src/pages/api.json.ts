// Re-serves the OpenAPI spec (docs/api.json) under the docs base path so the
// Scalar viewer in api.astro can fetch /docs/<version>/api.json from the same
// origin. The spec is read at build time rather than `import`ed — see
// src/lib/api-spec.ts for why (it's gitignored / may be absent in dev).
import type { APIRoute } from "astro";
import { readApiSpec } from "../lib/api-spec";

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(readApiSpec()), {
    headers: { "Content-Type": "application/json" },
  });
