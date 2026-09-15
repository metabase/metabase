import { Route, redirect, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

/**
 * The API key usage pages, in one chunk, so moving between the usage overview and the events
 * table does not cost a fetch each time.
 */
const apiKeyUsageSectionLayout = () =>
  import(
    /* webpackChunkName: "api-key-usage" */ "./components/ApiKeyUsageSectionLayout"
  ).then(({ ApiKeyUsageSectionLayout }) => ({
    Component: ApiKeyUsageSectionLayout,
  }));

const apiKeyUsagePage = () =>
  import(
    /* webpackChunkName: "api-key-usage" */ "./components/ApiKeyUsagePage"
  ).then(({ ApiKeyUsagePage }) => ({ Component: ApiKeyUsagePage }));

const apiKeyUsageEventsPage = () =>
  import(
    /* webpackChunkName: "api-key-usage" */ "./components/ApiKeyUsageEventsPage"
  ).then(({ ApiKeyUsageEventsPage }) => ({
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
