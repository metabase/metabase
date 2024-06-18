import querystring from "querystring";

import { safeJsonParse } from "metabase/lib/utils";

function parseQueryStringOptions(s) {
  const options = querystring.parse(s);
  for (const name in options) {
    if (options[name] === "") {
      options[name] = true;
    } else if (/^(true|false|-?\d+(\.\d+)?)$/.test(options[name])) {
      options[name] = safeJsonParse(options[name]);
    }
  }

  return options;
}

export function isDesktopSafari() {
  // from: https://stackoverflow.com/a/42189492/142317
  return "safari" in window;
}

export function parseHashOptions(hash) {
  return parseQueryStringOptions(hash.replace(/^#/, ""));
}

export function parseSearchOptions(search) {
  return parseQueryStringOptions(search.replace(/^\?/, ""));
}

export function stringifyHashOptions(options) {
  return querystring.stringify(options).replace(/=true\b/g, "");
}

export function updateQueryString(location, optionsUpdater) {
  const currentOptions = parseHashOptions(location.search.substring(1));
  const queryString = stringifyHashOptions(optionsUpdater(currentOptions));

  return {
    pathname: location.pathname,
    hash: location.hash,
    search: queryString ? `?${queryString}` : null,
  };
}

export function isMac() {
  const { platform = "" } = navigator;
  return Boolean(platform.match(/^Mac/));
}

export const METAKEY = isMac() ? "⌘" : "Ctrl";
