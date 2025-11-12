import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";

import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { getAllExpandableIds } from "metabase/common/components/tree/utils";
import { ModelingSidebarTreeNode } from "metabase/data-studio/pages/ModelingSectionLayout/ModelingSidebar/ModelingSidebarTreeNode";
import { CreateCardMenu } from "metabase/data-studio/pages/ModelingSectionLayout/ModelingSidebar/ModelingSidebarView/CreateCardMenu";
import { buildCollectionTree } from "metabase/entities/collections";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { Collection, CollectionId } from "metabase-types/api";

type SemanticLayerCollectionTreeProps = {
  rootCollection: Collection;
  selectedCollectionId: CollectionId | undefined;
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
};

export function SemanticLayerCollectionTree({
  rootCollection,
  selectedCollectionId,
  hasDataAccess,
  hasNativeWrite,
}: SemanticLayerCollectionTreeProps) {
  const collectionTree = useMemo(
    () => buildCollectionTree([rootCollection]),
    [rootCollection],
  );

  const initialExpandedIds = useMemo(
    () => getAllExpandableIds(collectionTree),
    [collectionTree],
  );

  const dispatch = useDispatch();

  const handleCollectionSelect = useCallback(
    (item: ITreeNodeItem) => {
      dispatch(push(Urls.dataStudioCollection(item.id)));
    },
    [dispatch],
  );

  return (
    <Tree
      data={collectionTree}
      selectedId={selectedCollectionId}
      initialExpandedIds={initialExpandedIds}
      onSelect={handleCollectionSelect}
      TreeNode={ModelingSidebarTreeNode}
      rightSection={(item: ITreeNodeItem) => {
        if (item.id !== rootCollection.id || !hasDataAccess) {
          return null;
        }

        return (
          <CreateCardMenu
            canCreateQueryModel={hasDataAccess}
            canCreateNativeModel={hasDataAccess && hasNativeWrite}
            canCreateMetric={hasDataAccess}
          />
        );
      }}
      role="tree"
    />
  );
}
