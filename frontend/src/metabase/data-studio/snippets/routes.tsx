import { SnippetsSectionLayout } from "metabase/data-studio/app/pages/SnippetsSectionLayout";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route } from "metabase/router";

/**
 * The snippet pages, in one chunk. They are small and always reached from the
 * same place, so one name keeps them to a single request.
 */
const snippetsPage = () =>
  import(
    /* webpackChunkName: "data-studio-snippets" */ "./pages/SnippetsPage"
  ).then(({ SnippetsPage }) => ({ Component: SnippetsPage }));

const newSnippetPage = () =>
  import(
    /* webpackChunkName: "data-studio-snippets" */ "./pages/NewSnippetPage"
  ).then(({ NewSnippetPage }) => ({ Component: NewSnippetPage }));

const archivedSnippetsPage = () =>
  import(
    /* webpackChunkName: "data-studio-snippets" */ "./pages/ArchivedSnippetsPage"
  ).then(({ ArchivedSnippetsPage }) => ({ Component: ArchivedSnippetsPage }));

const editSnippetPage = () =>
  import(
    /* webpackChunkName: "data-studio-snippets" */ "./pages/EditSnippetPage"
  ).then(({ EditSnippetPage }) => ({ Component: EditSnippetPage }));

const snippetDependenciesPage = () =>
  import(
    /* webpackChunkName: "data-studio-snippets" */ "./pages/SnippetDependenciesPage"
  ).then(({ SnippetDependenciesPage }) => ({
    Component: SnippetDependenciesPage,
  }));

export function getDataStudioSnippetRoutes() {
  return (
    <Route path="snippets" element={<SnippetsSectionLayout />}>
      <Route index lazy={snippetsPage} />
      <Route path="new" lazy={newSnippetPage} />
      <Route path="archived" lazy={archivedSnippetsPage} />
      <Route path=":snippetId" lazy={editSnippetPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path=":snippetId/dependencies" lazy={snippetDependenciesPage}>
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
    </Route>
  );
}
