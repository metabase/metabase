import { useMemo } from "react";

import { Outlet } from "metabase/router";
import * as Urls from "metabase/urls";
import {
  type SnippetHost,
  SnippetHostProvider,
} from "metabase-enterprise/data-studio/library/snippets/host";

import { useContentStudioScope } from "../scope";

export function ContentStudioSnippetsLayout() {
  const { worktreeId } = useContentStudioScope();

  const host = useMemo<SnippetHost>(() => {
    const scope = worktreeId != null ? { worktreeId } : {};

    return {
      worktreeId,
      rootUrl: Urls.contentStudioSnippets(scope),
      archivedSnippetsUrl: Urls.contentStudioArchivedSnippets(scope),
      getSnippetUrl: Urls.contentStudioSnippet,
      // Dependencies are not hosted in Content Studio yet.
      getSnippetDependenciesUrl: Urls.dataStudioSnippetDependencies,
      // Folders are browsed from the sidebar tree, so breadcrumbs only name them.
      getFolderUrl: null,
      hasHostChrome: true,
    };
  }, [worktreeId]);

  return (
    <SnippetHostProvider value={host}>
      <Outlet />
    </SnippetHostProvider>
  );
}
