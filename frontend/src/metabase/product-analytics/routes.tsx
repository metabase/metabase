import { Route } from "metabase/router";

const newAnalysisPage = () =>
  import("./pages/NewAnalysisPage").then(({ NewAnalysisPage }) => ({
    Component: NewAnalysisPage,
  }));

export const getRoutes = () => (
  <Route path="product-analysis/new" lazy={newAnalysisPage} />
);
