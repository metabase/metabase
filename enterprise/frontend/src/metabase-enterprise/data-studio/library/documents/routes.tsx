import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route } from "metabase/router";

import { LibrarySectionLayout } from "../pages/LibrarySectionLayout";

const documentsPage = () =>
  import(
    /* webpackChunkName: "data-studio-documents" */ "./pages/DocumentsPage"
  ).then(({ DocumentsPage }) => ({ Component: DocumentsPage }));

const documentOverviewPage = () =>
  import(
    /* webpackChunkName: "data-studio-documents" */ "./pages/DocumentOverviewPage"
  ).then(({ DocumentOverviewPage }) => ({ Component: DocumentOverviewPage }));

const documentContentsPage = () =>
  import(
    /* webpackChunkName: "data-studio-documents" */ "./pages/DocumentContentsPage"
  ).then(({ DocumentContentsPage }) => ({ Component: DocumentContentsPage }));

const documentDependenciesPage = () =>
  import(
    /* webpackChunkName: "data-studio-documents" */ "./pages/DocumentDependenciesPage"
  ).then(({ DocumentDependenciesPage }) => ({
    Component: DocumentDependenciesPage,
  }));

const documentHistoryPage = () =>
  import(
    /* webpackChunkName: "data-studio-documents" */ "./pages/DocumentHistoryPage"
  ).then(({ DocumentHistoryPage }) => ({ Component: DocumentHistoryPage }));

export function getDataStudioDocumentRoutes() {
  return (
    <Route
      path="documents"
      element={<LibrarySectionLayout section="library-documents" />}
    >
      <Route index lazy={documentsPage} />
      <Route path=":documentId" lazy={documentOverviewPage} />
      <Route path=":documentId/contents" lazy={documentContentsPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path=":documentId/dependencies" lazy={documentDependenciesPage}>
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      <Route path=":documentId/history" lazy={documentHistoryPage} />
    </Route>
  );
}
