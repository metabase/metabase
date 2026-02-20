import type { RouteObject } from "react-router-dom";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { IndexRoute, Route } from "metabase/routing/compat/react-router-v3";

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

export function getDataStudioSnippetRouteObjects(): RouteObject[] {
  return [
    { path: "snippets/new", element: <NewSnippetPage /> },
    { path: "snippets/archived", element: <ArchivedSnippetsPage /> },
    { path: "snippets/:snippetId", element: <EditSnippetPage /> },
    ...(PLUGIN_DEPENDENCIES.isEnabled
      ? [
          {
            path: "snippets/:snippetId/dependencies",
            element: <SnippetDependenciesPage />,
            children: [
              {
                index: true,
                element: <PLUGIN_DEPENDENCIES.DependencyGraphPage />,
              },
            ],
          } satisfies RouteObject,
        ]
      : []),
  ];
}
