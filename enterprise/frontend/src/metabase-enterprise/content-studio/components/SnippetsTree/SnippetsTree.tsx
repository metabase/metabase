import { useLocation } from "metabase/router";
import * as Urls from "metabase/urls";

import { useContentStudioScope } from "../../scope";
import { useScopeSnippetTree } from "../../snippet-tree";
import { NamespaceTree } from "../NamespaceTree";

/** The SQL snippets root of the branch the studio is scoped to, over its folders. */
export function SnippetsTree() {
  const { worktreeId } = useContentStudioScope();
  const { nodes } = useScopeSnippetTree();
  const { pathname } = useLocation();

  const scope = worktreeId != null ? { worktreeId } : {};
  const selectedCollectionId =
    Urls.extractContentStudioCollectionIdFromPath(pathname);

  return (
    <NamespaceTree
      section="snippets"
      url={Urls.contentStudioSnippets(scope)}
      folders={nodes}
      isRootSelected={pathname === Urls.contentStudioSnippets()}
      selectedFolderId={
        selectedCollectionId != null
          ? `collection:${selectedCollectionId}`
          : undefined
      }
    />
  );
}
