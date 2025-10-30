import { sessionPropertiesPath } from "metabase/api";
import { setOnBeforeRequestHandler } from "metabase/lib/api";
import { embedBase, internalBase } from "metabase/services";

const COMMON_NO_AUTH_CHECK_ENDPOINTS = [sessionPropertiesPath];

/**
 * URL patterns used for matching and transforming API requests
 * in static embedding mode.
 * These patterns are needed only for endpoints that have different parameter names/path/structure for `/embed`
 */
const URL_PATTERNS = {
  CARD_QUERY: `${internalBase}/card/:cardId/query`,
  CARD_PIVOT_QUERY: `${internalBase}/card/pivot/:cardId/query`,
  CARD_PARAMETER_VALUES: `${internalBase}/card/:cardId/params/:paramId/values`,
  CARD_PARAMETER_SEARCH: `${internalBase}/card/:cardId/params/:paramId/search/:query`,
  DASHBOARD_PARAMETER_VALUES: `${internalBase}/dashboard/:dashId/params/:paramId/values`,
  DASHBOARD_PARAMETER_SEARCH: `${internalBase}/dashboard/:dashId/params/:paramId/search/:query`,
} as const;

/**
 * Mapping of API endpoints to their static embedding equivalents.
 * Each transformation specifies the embed URL and HTTP method to use.
 */
const EMBED_URL_TRANSFORMATIONS: Record<
  string,
  { url: string; method: "GET" | "POST" }
> = {
  [URL_PATTERNS.CARD_QUERY]: {
    url: `${embedBase}/card/:token/query`,
    method: "GET",
  },
  [URL_PATTERNS.CARD_PIVOT_QUERY]: {
    url: `${embedBase}/pivot/card/:token/query`,
    method: "GET",
  },
  [URL_PATTERNS.CARD_PARAMETER_VALUES]: {
    url: `${embedBase}/card/:token/params/:paramId/values`,
    method: "GET",
  },
  [URL_PATTERNS.CARD_PARAMETER_SEARCH]: {
    url: `${embedBase}/card/:token/params/:paramId/search/:query`,
    method: "GET",
  },
  [URL_PATTERNS.DASHBOARD_PARAMETER_VALUES]: {
    url: `${embedBase}/dashboard/:token/params/:paramId/values`,
    method: "GET",
  },
  [URL_PATTERNS.DASHBOARD_PARAMETER_SEARCH]: {
    url: `${embedBase}/dashboard/:token/params/:paramId/search/:query`,
    method: "GET",
  },
} as const;

type RequestData = {
  method: "GET" | "POST";
  url: string;
  options: {
    headers?: Record<string, string>;
    hasBody: boolean;
  } & Record<string, unknown>;
};

/**
 * Converts a URL pattern with parameters (e.g., "/api/card/:id/query")
 * into a regular expression that can match actual URLs.
 *
 * @example
 * matchUrlPattern("/api/card/:id/query", "/api/card/123/query") // returns true
 * matchUrlPattern("/api/card/:id/query", "/api/card/123/edit") // returns false
 */
function matchUrlPattern(pattern: string, url: string): boolean {
  const regexString = pattern
    .replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")
    .replace(/\\:([a-zA-Z0-9_]+)/g, "([^/]+)");

  const regex = new RegExp(`^${regexString}$`);

  return regex.test(url);
}

/**
 * Finds the URL pattern that matches the given URL.
 */
function findMatchingPattern(url: string): string | null {
  for (const pattern of Object.values(URL_PATTERNS)) {
    if (matchUrlPattern(pattern, url)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Determines the appropriate request transformation for a given URL.
 * Returns null if no transformation is needed.
 */
function getRequestTransformation({
  method,
  url,
  options,
}: RequestData): RequestData | null {
  const matchedPattern = findMatchingPattern(url);

  if (
    matchedPattern &&
    COMMON_NO_AUTH_CHECK_ENDPOINTS.includes(matchedPattern)
  ) {
    return null;
  }

  // No transformation needed if pattern doesn't match
  if (!matchedPattern) {
    return { method, url, options };
  }

  // Apply the transformation for this pattern
  const transformation = EMBED_URL_TRANSFORMATIONS[matchedPattern];
  if (!transformation) {
    return { method, url, options };
  }

  return {
    ...transformation,
    options: {
      ...options,
      hasBody: transformation.method === "POST",
    },
  };
}

/**
 * Replaces the standard API base path with the embed API base path.
 */
function replaceWithEmbedBase(url: string): string {
  if (url.includes(internalBase) && !url.includes(embedBase)) {
    return url.replace(internalBase, embedBase);
  }
  return url;
}

/**
 * Registers a request interceptor that transforms standard API requests
 * into static embedding API requests.
 */
export const overrideRequestsForStaticEmbedding = () => {
  setOnBeforeRequestHandler({
    key: "override-requests-for-static-embedding",
    handler: async ({ method, url, options }) => {
      const transformation = getRequestTransformation({ method, url, options });

      if (!transformation) {
        return { method, url, options };
      }

      if (!options.headers) {
        options.headers = {};
      }

      /**
       * Set header to indicate that this request is for static embedding.
       */
      options.headers["x-metabase-static-embedding"] = "true";

      return {
        method: transformation.method,
        url: replaceWithEmbedBase(transformation.url),
        options: transformation.options,
      };
    },
  });
};
