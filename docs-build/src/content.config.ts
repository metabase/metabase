import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Versioned snapshots (DOCS_CONTENT_DIR) render historical markdown that still
// carries Jekyll-era frontmatter (layout, version, has_magic_breadcrumbs,
// category, ...). The canonical ../docs branch has been cleaned of those keys.
const versioned = Boolean(process.env.DOCS_CONTENT_DIR);

// Canonical build: exact types. title is optional — ~30% of /docs/ files
// (mostly auto-generated SDK snippets) have no frontmatter; the page derives a
// title from the first heading or filename when it's missing.
const strictFields = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  redirect_from: z.array(z.string()).optional(),
});

// Versioned snapshots render years of historical frontmatter, which is messier
// than just stray keys: some pages have object-valued titles, non-array
// redirect_from, etc. Coerce each known field to its expected shape (dropping
// anything malformed so the page falls back to its heading/filename) so a
// single bad page can never fail a whole version's build.
const laxString = z.preprocess(
  (v) => (typeof v === "string" ? v : undefined),
  z.string().optional(),
);
const laxFields = z.object({
  title: laxString,
  summary: laxString,
  redirect_from: z.preprocess(
    (v) =>
      Array.isArray(v) ? v.filter((x) => typeof x === "string") : undefined,
    z.array(z.string()).optional(),
  ),
});
const docs = defineCollection({
  loader: glob({
    pattern: [
      "**/*.md",
      "!**/node_modules/**",
      // Generated typedoc fragments — transcluded into authored pages via
      // the include_file plugin; not standalone pages.
      "!embedding/sdk/api/**",
      "!embedding/eajs/snippets/**",
    ],
    // Content source dir. Defaults to the repo's ../docs; DOCS_CONTENT_DIR
    // (absolute) points the build at a pre-extracted version snapshot, e.g.
    // build/55, so one Astro app can render any version's markdown.
    base: process.env.DOCS_CONTENT_DIR ?? "../docs",
  }),
  // Canonical build stays .strict() so stale/misspelled frontmatter is a
  // build-time error. Versioned snapshots use the coercing schema above.
  schema: versioned ? laxFields : strictFields.strict(),
});

export const collections = { docs };
