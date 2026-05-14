import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

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
    base: "../docs",
  }),
  schema: z
    .object({
      // title is optional: ~30% of /docs/ files (mostly auto-generated SDK
      // snippets) have no frontmatter at all. We derive a title from the
      // body's first heading or the filename when missing.
      title: z.string().optional(),
      summary: z.string().optional(),
      redirect_from: z.array(z.string()).optional(),
    })
    // .strict() makes any other key a build-time error. The Jekyll-era
    // schema (layout, version, has_magic_breadcrumbs, category, ...) was
    // silently passed through — strict surfaces typos and stale keys.
    .strict(),
});

export const collections = { docs };
