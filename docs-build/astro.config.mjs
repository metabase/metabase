import { defineConfig } from "astro/config";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExternalLinks from "rehype-external-links";
import { remarkLiquidIncludes } from "./src/plugins/remark-liquid-includes.mjs";
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
    remarkPlugins: [remarkGfm, remarkLiquidIncludes],
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: "wrap" }],
      [rehypeInternalLinks, { base }],
      [rehypeExternalLinks, { target: "_blank", rel: ["noopener", "noreferrer"] }],
      rehypeBlockquoteClasses,
    ],
    shikiConfig: {
      theme: "github-dark-dimmed",
      wrap: true,
    },
  },
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern-compiler",
        },
      },
    },
  },
});
