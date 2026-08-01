import { useLocation } from "metabase/router";
import { getCollectionNodeId } from "metabase/transforms/pages/TransformListPage/types";
import * as Urls from "metabase/urls";

import { useContentStudioScope } from "../../scope";
import { useScopeTransformTree } from "../../transform-tree";
import { NamespaceTree } from "../NamespaceTree";

/** The transforms root of the branch the studio is scoped to, over its folders. */
export function TransformsTree() {
  const { worktreeId } = useContentStudioScope();
  const { nodes } = useScopeTransformTree();
  const { pathname } = useLocation();

  const scope = worktreeId != null ? { worktreeId } : {};
  const selectedCollectionId =
    Urls.extractContentStudioCollectionIdFromPath(pathname);

  return (
    <NamespaceTree
      section="transforms"
      url={Urls.contentStudioTransforms(scope)}
      folders={nodes}
      isRootSelected={pathname === Urls.contentStudioTransforms()}
      selectedFolderId={
        typeof selectedCollectionId === "number"
          ? getCollectionNodeId(selectedCollectionId)
          : undefined
      }
    />
  );
}
