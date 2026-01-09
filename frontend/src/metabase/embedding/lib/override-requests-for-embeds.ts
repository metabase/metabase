import { sessionPropertiesPath } from "metabase/api";
import {
  PLUGIN_API,
  PLUGIN_CONTENT_TRANSLATION,
  PLUGIN_EMBEDDING_SDK,
} from "metabase/plugins";
import type { OnBeforeRequestHandlerData } from "metabase/plugins/oss/api";
import { getEmbedBase, internalBase, publicBase } from "metabase/services";
import type { CardId, DashboardId, ParameterId } from "metabase-types/api";

type EmbedType = "guest" | "static" | "public";

const getBaseUrlByEmbedType = (embedType: EmbedType): string =>
  ({
    guest: getEmbedBase(),
    static: getEmbedBase(),
    public: publicBase,
  })[embedType];

const getIgnoreOverridePatterns = () => [
  sessionPropertiesPath,
  PLUGIN_CONTENT_TRANSLATION.getDictionaryBasePath,
];

/**
 * URL patterns used for matching and transforming API requests in Guest Embed mode.
 * These patterns are needed only for endpoints that have different parameter names/path/structure for `/embed`
 */
const URL_PATTERNS = {
  CARD_QUERY: `${internalBase}/card/:cardId/query`,
  CARD_PIVOT_QUERY: `${internalBase}/card/pivot/:cardId/query`,
  CARD_PARAMETER_VALUES: `${internalBase}/card/:cardId/params/:paramId/values`,
  CARD_PARAMETER_SEARCH: `${internalBase}/card/:cardId/params/:paramId/search/:query`,
  CARD_PARAMETER_REMAPPING: `${internalBase}/card/:cardId/params/:paramId/remapping`,
  DASHBOARD_PARAMETER_VALUES: `${internalBase}/dashboard/:dashId/params/:paramId/values`,
  DASHBOARD_PARAMETER_SEARCH: `${internalBase}/dashboard/:dashId/params/:paramId/search/:query`,
  DASHBOARD_PARAMETER_REMAPPING: `${internalBase}/dashboard/:dashId/params/:paramId/remapping`,
} as const;

/**
 * Mapping of API endpoints to their Guest Embed equivalents.
 * Each transformation specifies the embed URL and HTTP method to use.
 */
const EMBED_URL_TRANSFORMATIONS: Record<
  string,
  (data: { embedType: EmbedType }) => {
    url: string;
    method: "GET" | "POST";
  }
> = {
  [URL_PATTERNS.CARD_QUERY]: ({ embedType }) => ({
    url: `${getBaseUrlByEmbedType(embedType)}/card/:token/query`,
    method: "GET",
  }),
  [URL_PATTERNS.CARD_PIVOT_QUERY]: ({ embedType }) => ({
    url: `${getBaseUrlByEmbedType(embedType)}/pivot/card/:token/query`,
    method: "GET",
  }),
  [URL_PATTERNS.CARD_PARAMETER_VALUES]: ({ embedType }) => ({
    url: `${getBaseUrlByEmbedType(embedType)}/card/:entityIdentifier/params/:paramId/values`,
    method: "GET",
  }),
  [URL_PATTERNS.CARD_PARAMETER_SEARCH]: ({ embedType }) => ({
    url: `${getBaseUrlByEmbedType(embedType)}/card/:entityIdentifier/params/:paramId/search/:query`,
    method: "GET",
  }),
  [URL_PATTERNS.CARD_PARAMETER_REMAPPING]: ({ embedType }) => ({
    url: `${getBaseUrlByEmbedType(embedType)}/card/:entityIdentifier/params/:paramId/remapping`,
    method: "GET",
  }),
  [URL_PATTERNS.DASHBOARD_PARAMETER_VALUES]: ({ embedType }) => ({
    url: `${getBaseUrlByEmbedType(embedType)}/dashboard/:entityIdentifier/params/:paramId/values`,
    method: "GET",
  }),
  [URL_PATTERNS.DASHBOARD_PARAMETER_SEARCH]: ({ embedType }) => ({
    url: `${getBaseUrlByEmbedType(embedType)}/dashboard/:entityIdentifier/params/:paramId/search/:query`,
    method: "GET",
  }),
  [URL_PATTERNS.DASHBOARD_PARAMETER_REMAPPING]: ({ embedType }) => ({
    url: `${getBaseUrlByEmbedType(embedType)}/dashboard/:entityIdentifier/params/:paramId/remapping`,
    method: "GET",
  }),
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
export function matchUrlPattern(pattern: string, url: string): boolean {
  const regexString = pattern
    .replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")
    .replace(/:([a-zA-Z0-9_]+)/g, "([^/]+)");

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
  embedType,
  url,
  options,
}: RequestData & { embedType: EmbedType }): RequestData | null {
  const matchedPattern = findMatchingPattern(url);

  if (
    getIgnoreOverridePatterns().some(
      (endpoint) => endpoint && url.includes(endpoint),
    )
  ) {
    return null;
  }

  // No transformation needed if pattern doesn't match
  if (!matchedPattern) {
    return { method, url, options };
  }

  // Apply the transformation for this pattern
  const transformation = EMBED_URL_TRANSFORMATIONS[matchedPattern]({
    embedType,
  });
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
function replaceWithEmbedBase({
  embedType,
  url,
}: {
  embedType: EmbedType;
  url: string;
}): string {
  const baseUrl = getBaseUrlByEmbedType(embedType);

  if (url.includes(internalBase) && !url.includes(baseUrl)) {
    return url.replace(internalBase, baseUrl);
  }

  return url;
}

const overrideRequests = async ({
  embedType,
  method,
  url,
  options,
}: OnBeforeRequestHandlerData & {
  embedType: EmbedType;
}) => {
  const transformation = getRequestTransformation({
    method,
    embedType,
    url,
    options,
  });

  if (!transformation) {
    return { method, url, options };
  }

  if (!options.headers) {
    options.headers = {};
  }

  /**
   * Set header to indicate that this request is for guest embed.
   */
  options.headers["x-metabase-guest-embed"] = "true";

  return {
    method: transformation.method,
    url: replaceWithEmbedBase({ embedType, url: transformation.url }),
    options: transformation.options,
  };
};

const setupRemappingUrls = (embedType: EmbedType) => {
  const baseUrl = getBaseUrlByEmbedType(embedType);

  PLUGIN_API.getRemappedDashboardParameterValueUrl = (
    _dashboardId: DashboardId | undefined,
    parameterId: ParameterId,
  ) =>
    `${baseUrl}/dashboard/:entityIdentifier/params/${encodeURIComponent(parameterId)}/remapping`;

  PLUGIN_API.getRemappedCardParameterValueUrl = (
    _cardId: CardId | string | undefined,
    parameterId: ParameterId,
  ) =>
    `${baseUrl}/card/:entityIdentifier/params/${encodeURIComponent(parameterId)}/remapping`;
};

/**
 * Registers a request interceptor that transforms standard API requests
 * into guest embeds API requests.
 */
export const overrideRequestsForGuestEmbeds = () => {
  setupRemappingUrls("guest");

  PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers.overrideRequestsForGuestEmbeds =
    (data) =>
      overrideRequests({
        ...data,
        embedType: "guest",
      });
};

/**
 * Registers a request interceptor that transforms standard API requests
 * into public or static embeds API requests.
 */
export const overrideRequestsForPublicOrStaticEmbeds = (
  embedType: "static" | "public",
) => {
  setupRemappingUrls(embedType);

  PLUGIN_API.onBeforeRequestHandlers.overrideRequestsForPublicEmbeds = (data) =>
    overrideRequests({
      ...data,
      embedType,
    });
};
