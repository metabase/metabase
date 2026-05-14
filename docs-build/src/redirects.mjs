// Loads the `redirect_from:` frontmatter array from every doc and builds
// the `{fromPath: toPath}` map that Astro's `redirects` config consumes.
//
// Convention: docs use Jekyll-style absolute paths like
// `/docs/latest/foo/bar`. We strip the leading `/docs/<version>/` segment
// from the source URL so the redirect KEY is base-relative — Astro emits
// the stub file under the build's `base` automatically. The destination
// URL, however, is NOT base-prepended by Astro, so we splice the build's
// `base` into the front of every target slug here. That way the same
// `redirect_from` entries work for /docs/latest, /docs/v0.NN, and
// /docs/master builds without per-version edits.
//
// Out-of-scope: entries whose path is NOT under `/docs/` (e.g. `/cloud/foo`,
// `/migrate/bar`, `/pricing/baz`) are marketing-site URLs. The docs build
// cannot emit redirects for routes outside its `base`, so we write them
// to a sidecar `public/marketing-redirects.json` for the delivery hop to
// pick up. Astro copies `public/` into `dist/`, so the file lands at
// `<base>/marketing-redirects.json` next to `llms.txt`.

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---/;
const DOCS_PREFIX_RE = /^\/docs\/[^/]+\//;

function walkMarkdown(dir, rel = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...walkMarkdown(abs, r));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push({ abs, rel: r });
    }
  }
  return out;
}

// Mirror the routing logic in src/pages/[...slug].astro: drop the .md
// extension, normalize a trailing /index, lowercase to match Astro's
// glob loader (which lowercases entry ids), and route the repo's README
// at the base root.
function slugFromRel(rel) {
  let s = rel.replace(/\.md$/i, "").toLowerCase().replace(/\/index$/, "");
  if (s === "readme") s = "";
  return s ? `/${s}` : "/";
}

export function loadRedirects({ docsDir, sidecarPath, base = "" }) {
  const redirects = {};
  const marketing = [];
  const collisions = [];
  // Normalize base: ensure a single leading "/", strip any trailing "/".
  const basePrefix = base.replace(/\/+$/, "").replace(/^\/?/, "/") === "/"
    ? ""
    : base.replace(/\/+$/, "").replace(/^\/?/, "/");
  const withBase = (slug) => {
    if (!basePrefix) return slug;
    return slug === "/" ? basePrefix : `${basePrefix}${slug}`;
  };

  for (const { abs, rel } of walkMarkdown(docsDir)) {
    let txt;
    try {
      txt = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const m = FRONTMATTER_RE.exec(txt);
    if (!m) continue;
    let data;
    try {
      data = yaml.load(m[1]) ?? {};
    } catch {
      continue;
    }
    const list = data.redirect_from;
    if (!Array.isArray(list)) continue;

    const targetSlug = slugFromRel(rel);
    const target = withBase(targetSlug);
    for (const raw of list) {
      if (typeof raw !== "string") continue;
      const from = raw.trim();
      if (!from.startsWith("/")) continue;

      if (DOCS_PREFIX_RE.test(from)) {
        const key = from.replace(DOCS_PREFIX_RE, "/");
        // Redirect-to-self is a no-op; check against the unprefixed slug
        // since the key is also base-relative.
        if (key === targetSlug) continue;
        if (redirects[key] && redirects[key] !== target) {
          collisions.push({
            key,
            existing: redirects[key],
            replacing: target,
            source: rel,
          });
        }
        redirects[key] = target;
      } else {
        // Marketing sidecar records canonical (base-prefixed) targets so
        // the delivery hop can emit absolute redirects without re-deriving
        // the build version.
        marketing.push({ from, to: target, source: rel });
      }
    }
  }

  if (sidecarPath) {
    fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
    if (marketing.length > 0) {
      fs.writeFileSync(sidecarPath, JSON.stringify(marketing, null, 2) + "\n");
    } else if (fs.existsSync(sidecarPath)) {
      fs.unlinkSync(sidecarPath);
    }
  }

  for (const c of collisions) {
    console.warn(
      `[redirects] collision: ${c.key} -> ${c.replacing} (was ${c.existing}); source: ${c.source}`,
    );
  }

  return {
    redirects,
    marketingCount: marketing.length,
    inDocsCount: Object.keys(redirects).length,
  };
}
