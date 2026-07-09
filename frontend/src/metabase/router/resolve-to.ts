import { type PlainRoute, matchPattern } from "./react-router";
import type { Path, To } from "./types";
import { parsePath } from "./utils";

/**
 * The URL prefix each matched route accounts for, mirroring react-router v7's
 * `match.pathnameBase`. Resolving `".."` walks this list rather than the URL,
 * so a route whose path spans several segments (`pulse/:pulseId/archive`) is
 * left in a single step, and a pathless route is left in no steps at all.
 *
 * How much of the URL a route accounts for is measured with v3's own
 * `matchPattern` rather than by counting `/`. A v3 pattern segment does not map
 * to one URL segment: `database(/:databaseId)(/schema/:schemaName)` matches
 * anything from `database` to `database/1/schema/public`.
 */
export function getRoutePathnames(
  routes: PlainRoute[],
  locationPathname: string,
): string[] {
  let matched = "";
  let remaining = locationPathname;

  return routes.map((route) => {
    const path = route.path;
    if (path) {
      // v3 matches an absolute child path against the whole pathname rather
      // than against what its parents left over.
      if (path.startsWith("/")) {
        matched = "";
        remaining = locationPathname;
      }

      const match = matchPattern(path, remaining);
      if (match) {
        // `matchPattern` hands back the separator at the head of the remainder,
        // so what it consumed is the rest of the string.
        const consumed = remaining.slice(
          0,
          remaining.length - match.remainingPathname.length,
        );
        matched += consumed;
        remaining = match.remainingPathname;
      }
    }
    return withoutTrailingSlash(matched);
  });
}

function withoutTrailingSlash(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/**
 * Resolve a `to` against the matched routes, mirroring react-router v7's
 * `resolveTo`. Absolute destinations pass through untouched; `".."` climbs one
 * route (or one path segment when `isPathRelative`), and a destination with no
 * pathname keeps the current one.
 *
 * @see https://github.com/remix-run/react-router/blob/main/packages/react-router/lib/router/utils.ts
 */
export function resolveTo(
  to: To,
  routePathnames: string[],
  locationPathname: string,
  isPathRelative: boolean,
): Path {
  const path = typeof to === "string" ? parsePath(to) : { ...to };
  const isEmptyPath = to === "" || path.pathname === "";
  const toPathname = isEmptyPath ? "/" : path.pathname;

  let from: string;
  if (toPathname == null) {
    from = locationPathname;
  } else {
    let routeIndex = routePathnames.length - 1;

    if (!isPathRelative && toPathname.startsWith("..")) {
      const segments = toPathname.split("/");
      while (segments[0] === "..") {
        segments.shift();
        routeIndex -= 1;
      }
      path.pathname = segments.join("/");
    }

    from = routeIndex >= 0 ? routePathnames[routeIndex] : "/";
  }

  const resolved = resolvePath(path, from);

  const hasExplicitTrailingSlash =
    toPathname != null && toPathname !== "/" && toPathname.endsWith("/");
  const hasCurrentTrailingSlash =
    (isEmptyPath || toPathname === ".") && locationPathname.endsWith("/");

  if (
    !resolved.pathname.endsWith("/") &&
    (hasExplicitTrailingSlash || hasCurrentTrailingSlash)
  ) {
    resolved.pathname += "/";
  }

  return resolved;
}

function resolvePath(to: Partial<Path>, fromPathname: string): Path {
  const { pathname: toPathname, search = "", hash = "" } = to;

  const pathname = toPathname
    ? toPathname.startsWith("/")
      ? toPathname
      : resolvePathname(toPathname, fromPathname)
    : fromPathname;

  return {
    pathname,
    search: normalize(search, "?"),
    hash: normalize(hash, "#"),
  };
}

function resolvePathname(relativePath: string, fromPathname: string): string {
  const segments = fromPathname.replace(/\/+$/, "").split("/");

  relativePath.split("/").forEach((segment) => {
    if (segment === "..") {
      if (segments.length > 1) {
        segments.pop();
      }
    } else if (segment !== ".") {
      segments.push(segment);
    }
  });

  return segments.length > 1 ? segments.join("/") : "/";
}

function normalize(value: string, prefix: string): string {
  if (!value || value === prefix) {
    return "";
  }
  return value.startsWith(prefix) ? value : prefix + value;
}
