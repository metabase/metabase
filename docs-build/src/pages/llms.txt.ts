// llms.txt — the index file consumed by AI tooling (Cursor, etc.) to
// discover docs pages by raw.githubusercontent.com URL. See src/lib/llms.ts
// for filter rules and version handling.
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { buildIndex } from "../lib/llms";

export const prerender = true;

export const GET: APIRoute = async () => {
  const entries = await getCollection("docs");
  return new Response(buildIndex(entries), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
