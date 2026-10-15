import { Route } from "metabase/router";

const newAnalysisPage = () =>
  import("./pages/NewAnalysisPage").then(({ NewAnalysisPage }) => ({
    Component: NewAnalysisPage,
  }));

const savedAnalysisPage = () =>
  import("./pages/SavedAnalysisPage").then(({ SavedAnalysisPage }) => ({
    Component: SavedAnalysisPage,
  }));

export const getRoutes = () => (
  <Route path="event-analysis">
    <Route path="new" lazy={newAnalysisPage} />
    <Route path=":cardId" lazy={savedAnalysisPage} />
  </Route>
);
