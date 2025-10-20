import api from "metabase/lib/api";
import { embedBase, internalBase } from "metabase/services";

/**
 * URL patterns used for matching and transforming API requests
 * in static embedding mode.
 */
const URL_PATTERNS = {
  SESSION_PROPERTIES: "/api/session/properties",
  CARD_QUERY: "/api/card/:cardId/query",
  CARD_PIVOT_QUERY: "/api/card/pivot/:cardId/query",
  DATASET: "/api/dataset",
  DATASET_QUERY_METADATA: "/api/dataset/query_metadata",
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
    url: "/api/embed/card/:token/query",
    method: "GET",
  },
  [URL_PATTERNS.CARD_PIVOT_QUERY]: {
    url: "/api/embed/pivot/card/:token/query",
    method: "GET",
  },
  [URL_PATTERNS.DATASET]: {
    url: "/api/embed/dataset/:token",
    method: "GET",
  },
  [URL_PATTERNS.DATASET_QUERY_METADATA]: {
    url: "/api/embed/dataset/:token/query_metadata",
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

  // session/properties endpoint can be executed as-is
  if (matchedPattern === URL_PATTERNS.SESSION_PROPERTIES) {
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
  api.onBeforeRequestHandlers.push(async ({ method, url, options }) => {
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
  });
};
