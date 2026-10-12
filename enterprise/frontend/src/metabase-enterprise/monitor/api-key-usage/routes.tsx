import { apiKeyUsageUpsellPage } from "metabase/monitor/routes";
import {
  notFoundRoute,
  outletRoute,
  redirectRoute,
} from "metabase/plugins/components/PluginPlaceholder";
import type { PluginRoute } from "metabase/plugins/types";
import { Route, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";
import { featureGatedRoute } from "metabase-enterprise/settings/feature-gated-route";

/**
 * The API key usage pages sit behind one barrel, so a single `import()` reaches all three and
 * they land in one chunk by construction — no risk of the webpackChunkName comments drifting
 * apart and silently splitting the bundle.
 */
const pages = () =>
  import(/* webpackChunkName: "api-key-usage" */ "./components");

const apiKeyUsageSectionLayout = () =>
  pages().then(({ ApiKeyUsageSectionLayout }) => ({
    Component: ApiKeyUsageSectionLayout,
  }));

const apiKeyUsagePage = () =>
  pages().then(({ ApiKeyUsagePage }) => ({ Component: ApiKeyUsagePage }));

const apiKeyUsageEventsPage = () =>
  pages().then(({ ApiKeyUsageEventsPage }) => ({
    Component: ApiKeyUsageEventsPage,
  }));

/**
 * Hovering the Monitor sidebar link starts the fetch, so the chunk is usually in hand by the
 * time the click lands.
 */
registerPagePrefetch(Urls.monitorApiKeyUsage(), apiKeyUsageSectionLayout);

const gated = (enabled: PluginRoute) =>
  featureGatedRoute("audit_app", enabled, apiKeyUsageUpsellPage);

export function getApiKeyUsageRoutes() {
  return (
    <>
      <Route index lazy={gated(redirectRoute("usage"))} />
      <Route
        lazy={featureGatedRoute(
          "audit_app",
          apiKeyUsageSectionLayout,
          outletRoute,
        )}
      >
        <Route path="usage" lazy={gated(apiKeyUsagePage)} />
        <Route path="events" lazy={gated(apiKeyUsageEventsPage)} />
      </Route>
      <Route path="*" lazy={gated(notFoundRoute)} />
    </>
  );
}
