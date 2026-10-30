import { Route, redirect, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

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

export function getApiKeyUsageRoutes() {
  return (
    <>
      <Route index element={redirect("usage")} />
      <Route lazy={apiKeyUsageSectionLayout}>
        <Route path="usage" lazy={apiKeyUsagePage} />
        <Route path="events" lazy={apiKeyUsageEventsPage} />
      </Route>
    </>
  );
}
