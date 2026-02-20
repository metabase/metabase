function toSearchFromQuery(query) {
  if (!query || typeof query !== "object") {
    return "";
  }

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value == null) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
    } else {
      params.set(key, String(value));
    }
  });

  const search = params.toString();
  return search ? `?${search}` : "";
}

export function toPath(location) {
  if (typeof location === "string") {
    return location;
  }

  if (!location || typeof location !== "object") {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  const pathname = location.pathname || window.location.pathname || "/";
  const search =
    typeof location.search === "string"
      ? location.search
        ? location.search.startsWith("?")
          ? location.search
          : `?${location.search}`
        : ""
      : toSearchFromQuery(location.query);
  const hash =
    typeof location.hash === "string"
      ? location.hash
        ? location.hash.startsWith("#")
          ? location.hash
          : `#${location.hash}`
        : ""
      : "";

  return `${pathname}${search}${hash}`;
}

export function pushPath(location) {
  window.history.pushState({}, "", toPath(location));
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function replacePath(location) {
  window.history.replaceState({}, "", toPath(location));
  window.dispatchEvent(new PopStateEvent("popstate"));
}
