import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";

import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getUser } from "metabase/selectors/user";
import type { Collection, CollectionId } from "metabase-types/api";

import { ModelingSidebarTreeNode } from "../../ModelingSidebarTreeNode";
import { CreateCardMenu } from "../CreateCardMenu";

import { getCollectionTree } from "./utils";

interface CollectionsSectionProps {
  collections: Collection[];
  selectedCollectionId?: CollectionId;
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
}

export function CollectionsSection({
  collections,
  selectedCollectionId,
  hasDataAccess,
  hasNativeWrite,
}: CollectionsSectionProps) {
  const currentUser = useSelector(getUser);
  const collectionTree = useMemo(
    () => (currentUser ? getCollectionTree(collections, currentUser) : []),
    [collections, currentUser],
  );
  const initialExpandedIds = useMemo(() => ["root"], []);
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
      TreeNode={ModelingSidebarTreeNode}
      rightSection={(item: ITreeNodeItem) => {
        if (item.id !== "root" || !hasDataAccess) {
          return null;
        }
        return (
          <CreateCardMenu
            canCreateModel={hasDataAccess}
            canCreateMetric={hasDataAccess}
            canCreateNativeQuery={hasNativeWrite}
          />
        );
      }}
      role="tree"
      onSelect={handleCollectionSelect}
    />
  );
}
