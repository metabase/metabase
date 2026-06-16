import querystring from "querystring";

import { safeJsonParse } from "metabase/utils/json-parse";

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

export function isWebkit() {
  const ua = navigator.userAgent || "";

  const isiOS = /iPad|iPhone|iPod/.test(ua);
  if (isiOS) {
    return true;
  }
  return (
    ua.includes("AppleWebKit") && navigator.vendor === "Apple Computer, Inc."
  );
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

export const isTouchDevice = () => {
  if (typeof window === "undefined") {
    return false;
  }

  if (typeof window.matchMedia === "function") {
    const hasCoarsePointerSupport =
      window.matchMedia("(pointer: coarse)").matches;
    const hasHoverSupport = window.matchMedia("(hover: hover)").matches;

    // true for phones/tablets (coarse pointer, no hover)
    // false for desktops (fine pointer, has hover)
    // false for laptops with touchscreens (coarse pointer, but also has hover)
    return hasCoarsePointerSupport && !hasHoverSupport;
  }

  // Fallback for environments without matchMedia (e.g. older browsers)
  return typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
};

export const METAKEY = isMac() ? "⌘" : "Ctrl";
export const ALTKEY = isMac() ? "⌥" : "Alt";
