import { defineConfig } from "astro/config";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExternalLinks from "rehype-external-links";
import { remarkDocsVersion } from "./src/plugins/remark-docs-version.mjs";
import { remarkIncludeFile } from "./src/plugins/remark-include-file.mjs";
import { rehypeBlockquoteClasses } from "./src/plugins/rehype-blockquote-classes.mjs";
import { rehypeInternalLinks } from "./src/plugins/rehype-internal-links.mjs";

const base = process.env.DOCS_BASE_PATH ?? "/docs/latest";

export default defineConfig({
  site: process.env.DOCS_SITE_URL ?? "https://www.metabase.com",
  base,
  outDir: "./dist",
  trailingSlash: "never",
  build: {
    format: "file",
  },
  markdown: {
    remarkPlugins: [remarkGfm, remarkDocsVersion, remarkIncludeFile],
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: "wrap" }],
      [rehypeInternalLinks, { base }],
      [rehypeExternalLinks, { target: "_blank", rel: ["noopener", "noreferrer"] }],
      rehypeBlockquoteClasses,
    ],
    shikiConfig: {
      // Light theme to match the live docs (white code blocks with a soft shadow).
      theme: "github-light",
      wrap: true,
    },
  },
});
