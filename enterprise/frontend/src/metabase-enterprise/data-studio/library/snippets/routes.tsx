import { IndexRoute, Route } from "react-router";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { ArchivedSnippetsPage } from "./pages/ArchivedSnippetsPage";
import { EditSnippetPage } from "./pages/EditSnippetPage";
import { NewSnippetPage } from "./pages/NewSnippetPage";
import { SnippetDependenciesPage } from "./pages/SnippetDependenciesPage";

export function getDataStudioSnippetRoutes() {
  return (
    <>
      <Route path="snippets/new" component={NewSnippetPage} />
      <Route path="snippets/archived" component={ArchivedSnippetsPage} />
      <Route path="snippets/:snippetId" component={EditSnippetPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path="snippets/:snippetId/dependencies"
          component={SnippetDependenciesPage}
        >
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
    </>
  );
}
