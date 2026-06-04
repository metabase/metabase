// Versioned-build-only: rewrite relative markdown image URLs to absolute,
// base-prefixed URLs (e.g. ./images/x.png → /docs/v0.52/databases/images/x.png).
//
// Why: when rendering a historical docs snapshot, Astro's content-asset
// resolver hard-fails the entire version's build on a single dangling image
// reference (`ImageNotFound`) — and old docs have plenty of those after years
// of churn. It also serializes every referenced image through sharp + an
// image-generation queue that races on shared sources. Turning each relative
// image into a plain absolute URL takes markdown images out of that pipeline
// entirely: a missing image degrades to a broken <img> instead of a failed
// build, and there's no optimization/staging to race. bin/render-versioned-
// docs.sh copies the actual image files into the output so these URLs resolve.
//
// Only wired in when DOCS_CONTENT_DIR is set (see astro.config.mjs); the
// canonical ../docs build keeps Astro's normal optimized-image handling.

import path from "node:path";
import { visit } from "unist-util-visit";

// Leave anything already absolute or non-local untouched.
const SKIP = /^(https?:|data:|mailto:|tel:|#|\/\/|\/)/i;

export function remarkVersionImages({ base = "/", contentDir = process.cwd() } = {}) {
  const baseClean = base.replace(/\/$/, "");
  const root = path.resolve(contentDir);

  return (tree, file) => {
    const src = Array.isArray(file?.history) ? file.history[0] : undefined;
    const fileDir = src ? path.dirname(src) : process.cwd();

    visit(tree, "image", (node) => {
      const url = node.url;
      if (typeof url !== "string" || url === "" || SKIP.test(url)) return;

      // Resolve the relative path against the markdown file's directory, then
      // re-express it relative to the content root and prefix the base path.
      const abs = path.resolve(fileDir, decodeURI(url.split(/[?#]/)[0]));
      const rel = path.relative(root, abs);
      // Outside the content root — can't map it to an output URL; leave as-is.
      if (rel === "" || rel.startsWith("..")) return;

      node.url = `${baseClean}/${rel.split(path.sep).join("/")}`;
    });
  };
}
