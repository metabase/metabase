// Dynamic endpoint for llms-{section}-full.txt: full concatenated section
// reference for AI RAG / large-context tooling (~90k tokens per file).
// Emitted only for sections that actually have content — see src/lib/llms.ts
// for the section list and filter rules.
import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import {
  LLMS_FULL_SECTIONS,
  type LlmsSection,
  buildSectionBundle,
  entryRelativePath,
} from "../lib/llms";

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => {
  const entries = await getCollection("docs");
  return LLMS_FULL_SECTIONS
    .filter((section) =>
      entries.some((e) => entryRelativePath(e).includes(`${section}/`)),
    )
    .map((section) => ({ params: { section } }));
};

export const GET: APIRoute = async ({ params }) => {
  const section = params.section as LlmsSection;
  const entries = await getCollection("docs");
  const body = buildSectionBundle(section, entries);
  // buildSectionBundle returning null is unreachable here — getStaticPaths
  // already filters out empty sections — but TS narrowing wants the guard.
  if (!body) return new Response("", { status: 404 });
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
