import { Route } from "metabase/router";

const analysisDocumentPage = () =>
  import("./pages/AnalysisDocumentPage").then(({ AnalysisDocumentPage }) => ({
    Component: AnalysisDocumentPage,
  }));

const analysisPage = () =>
  import("./pages/AnalysisPage").then(({ AnalysisPage }) => ({
    Component: AnalysisPage,
  }));

const savedAnalysisPage = () =>
  import("./pages/SavedAnalysisPage").then(({ SavedAnalysisPage }) => ({
    Component: SavedAnalysisPage,
  }));

export const getRoutes = () => (
  <Route path="event-analysis">
    <Route path="new" lazy={analysisDocumentPage} />
    <Route path="document/:id" lazy={analysisDocumentPage} />
    <Route path="new/:kind" lazy={analysisPage} />
    <Route path=":cardId" lazy={savedAnalysisPage} />
  </Route>
);
