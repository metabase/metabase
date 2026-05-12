import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const docs = defineCollection({
  loader: glob({
    pattern: ["**/*.md", "!**/node_modules/**"],
    base: "../docs",
  }),
  schema: z.object({
    // title is optional: ~30% of /docs/ files (mostly auto-generated SDK
    // snippets) have no frontmatter at all. We derive a title from the
    // body's first heading or the filename when missing.
    title: z.string().optional(),
    summary: z.string().optional(),
    redirect_from: z.array(z.string()).optional(),
  }),
});

export const collections = { docs };
