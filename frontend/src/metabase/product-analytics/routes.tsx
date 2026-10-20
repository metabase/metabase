import { Route } from "metabase/router";

const analysisDocumentPage = () =>
  import("./pages/AnalysisDocumentPage").then(({ AnalysisDocumentPage }) => ({
    Component: AnalysisDocumentPage,
  }));

/** Loads the document page, able to hold event analyses. */
export const notebookPage = () =>
  import(/* webpackChunkName: "documents" */ "./pages/NotebookPage").then(
    ({ NotebookPage }) => ({ Component: NotebookPage }),
  );

const dataAppGuidePage = () =>
  import("./pages/DataAppGuidePage").then(({ DataAppGuidePage }) => ({
    Component: DataAppGuidePage,
  }));

export const getRoutes = () => (
  <>
    <Route path="event-analysis">
      <Route path="new" lazy={analysisDocumentPage} />
      <Route path="document/:id" lazy={analysisDocumentPage} />
    </Route>
    <Route path="data-app/new" lazy={dataAppGuidePage} />
  </>
);
