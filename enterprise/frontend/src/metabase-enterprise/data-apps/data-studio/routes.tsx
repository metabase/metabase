import type { ComponentType } from "react";

import { Route } from "metabase/router";
import * as Urls from "metabase/urls";

const sectionLayout = () =>
  import(
    /* webpackChunkName: "data-studio-data-apps" */ "./pages/DataAppsSectionLayout"
  ).then(({ DataAppsSectionLayout }) => ({ Component: DataAppsSectionLayout }));

const listPage = () =>
  import(
    /* webpackChunkName: "data-studio-data-apps" */ "./pages/DataAppListPage"
  ).then(({ DataAppListPage }) => ({ Component: DataAppListPage }));

const overviewPage = () =>
  import(
    /* webpackChunkName: "data-studio-data-apps" */ "./pages/DataAppOverviewPage"
  ).then(({ DataAppOverviewPage }) => ({ Component: DataAppOverviewPage }));

export function getDataStudioDataAppRoutes(IsAdmin: ComponentType) {
  return (
    <Route path={Urls.DATA_APP_URL_SEGMENT} element={<IsAdmin />}>
      <Route lazy={sectionLayout}>
        <Route index lazy={listPage} />
        <Route path=":name" lazy={overviewPage} />
      </Route>
    </Route>
  );
}
