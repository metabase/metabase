// Rewrites in-content anchor hrefs so they work after Astro's build:
//
//   - strips ".md" / ".md#anchor" suffixes — Astro routes have no .md
//   - strips "/index" trailing segment
//   - prefixes the configured base path when the link references a docs path
//   - leaves external (http/https/mailto), in-page (#…), and /learn/ links alone
//
// `base` must match `astro.config.mjs`'s `base` (e.g. "/docs/latest").

import { visit } from "unist-util-visit";

const EXTERNAL = /^(https?:|mailto:|tel:|#|\/\/)/;

export function rehypeInternalLinks({ base = "/" } = {}) {
  const baseClean = base.replace(/\/$/, "");

  return (tree) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "a") return;
      const href = node.properties?.href;
      if (typeof href !== "string" || href === "") return;
      if (EXTERNAL.test(href)) return;

      // /learn/... and other cross-site absolute paths (not under /docs/)
      // pass through unchanged.
      if (href.startsWith("/learn/")) return;

      // Strip .md (possibly with an anchor).
      let next = href.replace(/\.md(#.*)?$/, (_, hash) => hash ?? "");
      // Strip /index endings (e.g., "foo/index.md" → "foo/").
      next = next.replace(/\/index(#.*)?$/, "/$1");

      // If the link is an absolute /docs/... path with the old hardcoded
      // /docs/latest prefix, swap that prefix for the build's base. Other
      // absolute paths and relative paths pass through with just the .md
      // strip — Astro resolves the latter against the current page URL.
      if (next.startsWith("/docs/")) {
        next = next.replace(/^\/docs\/[^/]+/, baseClean);
      }
      node.properties.href = next;
    });
  };
}
