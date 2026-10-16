import { Route } from "metabase/router";

const analysisDocumentPage = () =>
  import("./pages/AnalysisDocumentPage").then(({ AnalysisDocumentPage }) => ({
    Component: AnalysisDocumentPage,
  }));

export const getRoutes = () => (
  <Route path="event-analysis">
    <Route path="new" lazy={analysisDocumentPage} />
    <Route path="document/:id" lazy={analysisDocumentPage} />
  </Route>
);
