import type { RouteObject } from "react-router-dom";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { useRouteParams } from "metabase/routing/compat";

import { ArchivedSnippetsPage } from "./pages/ArchivedSnippetsPage";
import { EditSnippetPage } from "./pages/EditSnippetPage";
import { NewSnippetPage } from "./pages/NewSnippetPage";
import { SnippetDependenciesPage } from "./pages/SnippetDependenciesPage";

const EditSnippetPageWithRouteProps = () => {
  const params = useRouteParams<{ snippetId?: string }>();
  return <EditSnippetPage params={{ snippetId: params.snippetId ?? "" }} />;
};

export function getDataStudioSnippetRoutes() {
  return null;
}

export function getDataStudioSnippetRouteObjects(): RouteObject[] {
  return [
    { path: "snippets/new", element: <NewSnippetPage /> },
    { path: "snippets/archived", element: <ArchivedSnippetsPage /> },
    { path: "snippets/:snippetId", element: <EditSnippetPageWithRouteProps /> },
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
