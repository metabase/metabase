import querystring from "querystring";

import { safeJsonParse } from "metabase/lib/json-parse";

function parseQueryStringOptions(s: string) {
  const options: Record<string, string | string[] | boolean | undefined> =
    querystring.parse(s);
  for (const name in options) {
    const value = options[name];
    if (value === "") {
      options[name] = true;
    } else if (
      typeof value === "string" &&
      /^(true|false|-?\d+(\.\d+)?)$/.test(value)
    ) {
      options[name] = safeJsonParse(value);
    }
  }
  return options;
}

export function isDesktopSafari() {
  // from: https://stackoverflow.com/a/42189492/142317
  return "safari" in window;
}

export function parseHashOptions(hash: string) {
  return parseQueryStringOptions(hash.replace(/^#/, ""));
}

export function parseSearchOptions(search: string) {
  return parseQueryStringOptions(search.replace(/^\?/, ""));
}

export function stringifyHashOptions(options: querystring.ParsedUrlQueryInput) {
  return querystring.stringify(options).replace(/=true\b/g, "");
}

export function isMac() {
  const { platform = "" } = navigator;
  return Boolean(platform.match(/^Mac/));
}

export const METAKEY = isMac() ? "⌘" : "Ctrl";
