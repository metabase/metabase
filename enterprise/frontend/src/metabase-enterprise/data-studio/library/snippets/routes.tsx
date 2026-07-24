import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route, withRouteProps } from "metabase/router";

import { ArchivedSnippetsPage } from "./pages/ArchivedSnippetsPage";
import { EditSnippetPage } from "./pages/EditSnippetPage";
import { NewSnippetPage } from "./pages/NewSnippetPage";
import { SnippetDependenciesPage } from "./pages/SnippetDependenciesPage";

const RoutedNewSnippetPage = withRouteProps(NewSnippetPage);
const RoutedEditSnippetPage = withRouteProps(EditSnippetPage);
const RoutedSnippetDependenciesPage = withRouteProps(SnippetDependenciesPage);

export function getDataStudioSnippetRoutes() {
  return (
    <>
      <Route path="snippets/new" element={<RoutedNewSnippetPage />} />
      <Route path="snippets/archived" element={<ArchivedSnippetsPage />} />
      <Route path="snippets/:snippetId" element={<RoutedEditSnippetPage />} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path="snippets/:snippetId/dependencies"
          element={<RoutedSnippetDependenciesPage />}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
    </>
  );
}
