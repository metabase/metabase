import { sessionPropertiesPath } from "metabase/api";
import { type RequestMethod, api } from "metabase/api/client";
import { isEmbedPreview } from "metabase/embedding/config";
import {
  PLUGIN_API,
  PLUGIN_CONTENT_TRANSLATION,
  PLUGIN_EMBEDDING_SDK,
} from "metabase/plugins";
import type { OnBeforeRequestHandlerConfig } from "metabase/plugins/oss/api";
import type { CardId, DashboardId, ParameterId } from "metabase-types/api";

type EmbedType = "guest" | "static" | "public";

const getBaseUrlByEmbedType = (embedType: EmbedType): string =>
  ({
    guest: "/api/embed",
    static: "/api/embed",
    public: "/api/public",
  })[embedType];

const getIgnoreOverridePatterns = () => [
  sessionPropertiesPath,
  PLUGIN_CONTENT_TRANSLATION.getDictionaryBasePath,
  // `/api/frontend-errors` only exists at the canonical path (see
  // metabase.frontend-errors.api) — rewriting it would 404.
  "/api/frontend-errors",
];

/**
 * URL patterns used for matching and transforming API requests in Guest Embed mode.
 * These patterns are needed only for endpoints that have different parameter names/path/structure for `/embed`
 */
const URL_PATTERNS = {
  CARD_QUERY: `/api/card/:cardId/query`,
  CARD_PIVOT_QUERY: `/api/card/pivot/:cardId/query`,
  CARD_PARAMETER_VALUES: `/api/card/:cardId/params/:paramId/values`,
  CARD_PARAMETER_SEARCH: `/api/card/:cardId/params/:paramId/search/:query`,
  CARD_PARAMETER_REMAPPING: `/api/card/:cardId/params/:paramId/remapping`,
  DASHBOARD_PARAMETER_VALUES: `/api/dashboard/:dashId/params/:paramId/values`,
  DASHBOARD_PARAMETER_SEARCH: `/api/dashboard/:dashId/params/:paramId/search/:query`,
  DASHBOARD_PARAMETER_REMAPPING: `/api/dashboard/:dashId/params/:paramId/remapping`,
} as const;

/**
 * Mapping of API endpoints to their Guest Embed equivalents.
 * Each transformation specifies the embed URL and HTTP method to use.
 */
const EMBED_URL_TRANSFORMATIONS: Record<
  string,
  (data: { embedType: EmbedType }) => {
    url: string;
    method: RequestMethod;
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
  method: RequestMethod;
  url: string;
  headers?: Record<string, string>;
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
  headers,
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
    return { method, url, headers };
  }

  // Apply the transformation for this pattern
  const transformation = EMBED_URL_TRANSFORMATIONS[matchedPattern]({
    embedType,
  });
  if (!transformation) {
    return { method, url, headers };
  }

  return {
    ...transformation,
    headers,
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

  if (url.includes("/api") && !url.includes(baseUrl)) {
    return url.replace("/api", baseUrl);
  }

  return url;
}

export const overrideRequests = async ({
  embedType,
  method,
  url,
  headers,
  data,
}: OnBeforeRequestHandlerConfig & {
  embedType: EmbedType;
}) => {
  const transformation = getRequestTransformation({
    method,
    embedType,
    url,
    headers,
  });

  if (!transformation) {
    return { method, url, headers, data };
  }

  return {
    method: transformation.method,
    url: replaceWithEmbedBase({ embedType, url: transformation.url }),
    headers: transformation.headers ?? {},
    data,
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

const EMBED_API_BASE_PATTERN = /^\/api\/embed(?=\/|$)/;
const EMBED_PREVIEW_API_BASE = "/api/preview_embed";

/**
 * In an embed preview (Metabase iframed in itself) the embed endpoints live
 * under `/api/preview_embed` instead of `/api/embed`. Rewriting the base here
 * lets call sites hardcode `/api/embed` and stay preview-agnostic. The pattern
 * is anchored at the start so only the base path is replaced.
 */
export const rewriteEmbedPreviewUrl = async ({
  url,
}: OnBeforeRequestHandlerConfig) => {
  if (isEmbedPreview() && EMBED_API_BASE_PATTERN.test(url)) {
    return { url: url.replace(EMBED_API_BASE_PATTERN, EMBED_PREVIEW_API_BASE) };
  }
};

/**
 * Registers the embed-preview rewrite on the shared client. It runs after the
 * embed override handlers, so it covers both the override-produced
 * `/api/embed/...` urls and the embed endpoints called directly.
 *
 * Idempotent, so call sites can register it at the earliest safe moment without
 * worrying about duplicates. For public/static embeds it must run *before* the
 * dashboard fetcher's effect (see `usePublicEndpoints`): React runs child
 * effects before parent effects, so registering from a parent `useMount` would
 * miss the very first embed request (the dashboard load).
 */
export const setupEmbedPreviewRewrite = () => {
  if (!api.beforeRequestHandlers.includes(rewriteEmbedPreviewUrl)) {
    api.beforeRequestHandlers.push(rewriteEmbedPreviewUrl);
  }
};

/**
 * Registers a request interceptor that transforms standard API requests
 * into guest embeds API requests.
 */
export const overrideRequestsForGuestEmbeds = () => {
  setupRemappingUrls("guest");
  setupEmbedPreviewRewrite();

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
