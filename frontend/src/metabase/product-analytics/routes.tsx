import { Route } from "metabase/router";

const debugPage = () =>
  import("./pages/DebugPage").then(({ ProductAnalyticsDebugPage }) => ({
    Component: ProductAnalyticsDebugPage,
  }));

export const getRoutes = () => (
  <Route path="product-analytics">
    <Route path="debug" lazy={debugPage} />
  </Route>
);
