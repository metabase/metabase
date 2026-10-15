import { Route } from "metabase/router";

const newAnalysisPage = () =>
  import("./pages/NewAnalysisPage").then(({ NewAnalysisPage }) => ({
    Component: NewAnalysisPage,
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
    <Route path="new" lazy={newAnalysisPage} />
    <Route path="new/:kind" lazy={analysisPage} />
    <Route path=":cardId" lazy={savedAnalysisPage} />
  </Route>
);
