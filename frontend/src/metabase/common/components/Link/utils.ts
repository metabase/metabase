import type { To } from "react-router-dom";

export type LinkToWithQuery =
  | To
  | {
      pathname?: string;
      search?: string;
      hash?: string;
      query?: Record<string, unknown>;
    };

const toSearchFromQuery = (query?: Record<string, unknown>) => {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value == null) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
      return;
    }

    params.set(key, String(value));
  });

  const search = params.toString();
  return search ? `?${search}` : "";
};

export const normalizeTo = (to: LinkToWithQuery): To => {
  if (typeof to === "string") {
    return to;
  }

  if (to && typeof to === "object" && "query" in to) {
    const { query, ...rest } = to;

    return {
      ...rest,
      search:
        typeof rest.search === "string" && rest.search !== ""
          ? rest.search
          : toSearchFromQuery(query),
    };
  }

  return to as To;
};
