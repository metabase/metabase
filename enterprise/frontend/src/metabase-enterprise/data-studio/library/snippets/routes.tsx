import { IndexRoute, Route } from "react-router";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { EditSnippetPage } from "./pages/EditSnippetPage";
import { NewSnippetPage } from "./pages/NewSnippetPage";
import { SnippetDependenciesPage } from "./pages/SnippetDependenciesPage";

export function getDataStudioSnippetRoutes() {
  return (
    <>
      <Route path="snippets/new" component={NewSnippetPage} />
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
