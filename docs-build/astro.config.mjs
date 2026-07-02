import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, passthroughImageService } from "astro/config";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExternalLinks from "rehype-external-links";
import { remarkDocsVersion } from "./src/plugins/remark-docs-version.mjs";
import { remarkIncludeFile } from "./src/plugins/remark-include-file.mjs";
import { remarkVersionImages } from "./src/plugins/remark-version-images.mjs";
import { rehypeBlockquoteClasses } from "./src/plugins/rehype-blockquote-classes.mjs";
import { rehypeInternalLinks } from "./src/plugins/rehype-internal-links.mjs";
import { loadRedirects } from "./src/redirects.mjs";

const base = process.env.DOCS_BASE_PATH ?? "/docs/latest";

// A versioned snapshot build (content sourced from build/<version> via
// DOCS_CONTENT_DIR) renders historical markdown from outside the project root.
const versioned = Boolean(process.env.DOCS_CONTENT_DIR);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Content source dir. Defaults to the repo's ../docs; DOCS_CONTENT_DIR points
// the build at a pre-extracted version snapshot (e.g. build/55) so a single
// Astro app can render any version. Must agree with src/content.config.ts and
// src/lib/api-spec.ts.
const docsDir = process.env.DOCS_CONTENT_DIR
  ? path.resolve(process.env.DOCS_CONTENT_DIR)
  : path.resolve(__dirname, "../docs");
// Sidecar file for redirects whose source path is outside `/docs/`
// (marketing-site URLs). Lives under public/ so Astro copies it into
// dist/ at build time; the delivery hop consumes it to wire those into
// the marketing site's redirect layer.
const marketingSidecar = path.resolve(
  __dirname,
  "public/marketing-redirects.json",
);
const { redirects, inDocsCount, marketingCount } = loadRedirects({
  docsDir,
  sidecarPath: marketingSidecar,
  base,
});
console.log(
  `[redirects] ${inDocsCount} in-docs redirects, ${marketingCount} marketing-site redirects (sidecar: public/marketing-redirects.json)`,
);

export default defineConfig({
  site: process.env.DOCS_SITE_URL ?? "https://www.metabase.com",
  base,
  outDir: "./dist",
  // Versioned snapshots render 500+ images per version across ~26 versions;
  // sharp-optimizing all of them (some are multi-MB) is needless work for an
  // archival build, so pass images through untouched. The canonical production
  // build keeps full optimization.
  ...(versioned ? { image: { service: passthroughImageService() } } : {}),
  trailingSlash: "ignore",
  redirects,
  server: {
    port: 4321,
  },
  vite: {
    server: {
      // Hard-fail if 4321 is in use instead of silently bumping to 4322 — keeps
      // orphaned `astro dev` processes from stacking unnoticed.
      strictPort: true,
    },
  },
  build: {
    format: "file",
  },
  markdown: {
    remarkPlugins: [
      remarkGfm,
      remarkDocsVersion,
      remarkIncludeFile,
      // Versioned snapshots: turn relative markdown images into absolute,
      // base-prefixed URLs so a dangling image reference (common in old docs)
      // degrades to a broken <img> instead of failing the whole build. Runs
      // after include_file so transcluded images are rewritten too. The
      // orchestrator copies the image files into the output. Must come last.
      ...(versioned
        ? [[remarkVersionImages, { base, contentDir: docsDir }]]
        : []),
    ],
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: "wrap" }],
      [rehypeInternalLinks, { base }],
      [
        rehypeExternalLinks,
        { target: "_blank", rel: ["noopener", "noreferrer"] },
      ],
      rehypeBlockquoteClasses,
    ],
    shikiConfig: {
      // Light theme to match the live docs (white code blocks with a soft shadow).
      theme: "github-light",
      wrap: true,
    },
  },
});
