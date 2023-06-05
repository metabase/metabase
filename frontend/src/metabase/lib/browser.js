import querystring from "querystring";

function parseQueryStringOptions(s) {
  const options = querystring.parse(s);

  for (const name in options) {
    if (options[name] === "") {
      options[name] = true;
    } else if (/^(true|false|-?\d+(\.\d+)?)$/.test(options[name])) {
      options[name] = JSON.parse(options[name]);
    }
  }

  return options;
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

export function isMac() {
  const { platform = "" } = navigator;
  return Boolean(platform.match(/^Mac/));
}
