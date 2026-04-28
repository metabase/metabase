import fetchMock from "fetch-mock";

import { createMockSettings } from "metabase-types/api/mocks";

import {
  setupPopularItemsEndpoints,
  setupRecentViewsEndpoints,
} from "./activity";
import { setupBookmarksEndpoints } from "./bookmark";
import { setupUserMetabotPermissionsEndpoint } from "./metabot";
import { setupTokenStatusEndpointEmpty } from "./premium-features";
import { setupNotificationChannelsEndpoints } from "./pulse";
import { setupPropertiesEndpoints } from "./session";
import { setupSettingsEndpoints } from "./settings";
import { setupTimelinesEndpoints } from "./timeline";

/**
 * Register sensible defaults for endpoints the app shell hits on mount.
 *
 * Called automatically by `renderWithProviders` AFTER any test-specific
 * `setupX` calls. Each default is registered only if the same URL+method
 * isn't already mocked, so explicit setup helpers always win.
 *
 * Pass `{ defaultEndpoints: false }` to `renderWithProviders` to opt out.
 */
export function setupDefaultAppEndpoints() {
  ifNotMocked("path:/api/bookmark", "get", () => setupBookmarksEndpoints([]));
  ifNotMocked("path:/api/timeline", "get", () => setupTimelinesEndpoints([]));
  ifNotMocked(/\/api\/activity\/recents\?*/, "get", () =>
    setupRecentViewsEndpoints([]),
  );
  ifNotMocked("path:/api/activity/popular_items", "get", () =>
    setupPopularItemsEndpoints([]),
  );
  ifNotMocked("path:/api/session/properties", "get", () =>
    setupPropertiesEndpoints(createMockSettings()),
  );
  ifNotMocked("path:/api/setting", "get", () => setupSettingsEndpoints([]));
  ifNotMocked("path:/api/pulse/form_input", "get", () =>
    setupNotificationChannelsEndpoints({}),
  );
  ifNotMocked("path:/api/premium-features/token/status", "get", () =>
    setupTokenStatusEndpointEmpty(),
  );
  ifNotMocked("path:/api/metabot/permissions/user-permissions", "get", () =>
    setupUserMetabotPermissionsEndpoint(),
  );

  // Endpoints without a dedicated helper.
  ifNotMocked("path:/api/bookmark/ordering", "put", () => {
    fetchMock.put("path:/api/bookmark/ordering", 204);
  });
  ifNotMocked("path:/api/activity/recents", "post", () => {
    fetchMock.post("path:/api/activity/recents", 204);
  });
}

function ifNotMocked(
  url: string | RegExp,
  method: string,
  register: () => void,
) {
  if (!isMocked(url, method)) {
    register();
  }
}

function isMocked(url: string | RegExp, method: string): boolean {
  const target = method.toLowerCase();
  return fetchMock.router.routes.some((route) => {
    const cfg = route.config;
    if (cfg.method?.toLowerCase() !== target) {
      return false;
    }
    // Routes with query/body matchers are specific overrides, not catch-alls
    // — don't let them suppress the catch-all default.
    if (cfg.query || cfg.body) {
      return false;
    }
    if (typeof url === "string") {
      return cfg.url === url;
    }
    return cfg.url instanceof RegExp && cfg.url.source === url.source;
  });
}
