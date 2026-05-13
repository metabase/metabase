// Parses nav.yml at build time and provides utilities for the Sidebar
// and TopBar components.
//
// The YAML is imported via Vite's `?raw` query: Vite resolves the path
// at source compile time and inlines the file contents as a string. This
// avoids the import.meta.url / fs.readFileSync resolution trap that breaks
// after Astro bundles the module.

import yaml from "js-yaml";
import navYamlSource from "../../nav.yml?raw";

export interface NavPage {
  name: string;
  url?: string;
  navName?: string;
  pages?: NavPage[];
}

export interface NavCategory {
  name: string;
  pages: NavPage[];
}

export interface NavData {
  categories: NavCategory[];
}

let cached: NavData | null = null;

export function getNav(): NavData {
  if (cached) return cached;
  cached = yaml.load(navYamlSource) as NavData;
  return cached;
}

export function findTrail(
  slug: string,
  nav: NavData = getNav(),
): NavPage[] | null {
  for (const cat of nav.categories) {
    const trail = walk(cat.pages, slug, [{ name: cat.name }]);
    if (trail) return trail;
  }
  return null;
}

// Resolve a nav page's `url` field to a usable href:
//   - external (http/https) and /learn/* links pass through unchanged
//   - everything else is treated as a docs-relative path and prefixed with `base`
// Returns undefined when the page has no url (group label).
export function hrefForPage(p: NavPage, base: string): string | undefined {
  if (!p.url) return undefined;
  if (/^https?:\/\//.test(p.url) || p.url.startsWith("/learn/")) return p.url;
  return base + "/" + p.url.replace(/^\/+/, "");
}

// True when a nav page's `url` corresponds to the current page's `slug`.
// External and /learn/* links are never "current" — those leave the docs.
export function urlMatchesSlug(
  url: string | undefined,
  slug: string,
): boolean {
  if (!url) return false;
  if (/^https?:/.test(url) || url.startsWith("/learn/")) return false;
  const norm = (s: string) => s.replace(/^\/+|\/+$/g, "");
  return norm(url) === norm(slug);
}

function walk(
  pages: NavPage[],
  slug: string,
  trail: NavPage[],
): NavPage[] | null {
  for (const page of pages) {
    const here = [...trail, page];
    if (urlMatchesSlug(page.url, slug)) return here;
    if (page.pages) {
      const found = walk(page.pages, slug, here);
      if (found) return found;
    }
  }
  return null;
}
