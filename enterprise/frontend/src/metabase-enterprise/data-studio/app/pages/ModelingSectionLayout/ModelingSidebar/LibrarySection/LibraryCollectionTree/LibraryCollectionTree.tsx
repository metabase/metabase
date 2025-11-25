import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";

import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { getAllExpandableIds } from "metabase/common/components/tree/utils";
import { buildCollectionTree } from "metabase/entities/collections";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { ModelingSidebarTreeNode } from "metabase-enterprise/data-studio/app/pages/ModelingSectionLayout/ModelingSidebar/ModelingSidebarTreeNode";
import { CreateCardMenu } from "metabase-enterprise/data-studio/app/pages/ModelingSectionLayout/ModelingSidebar/ModelingSidebarView/CreateCardMenu";
import type { Collection, CollectionId } from "metabase-types/api";

import { getWritableCollection } from "./utils";

type LibraryCollectionTreeProps = {
  rootCollection: Collection;
  selectedCollectionId: CollectionId | undefined;
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
};

export function LibraryCollectionTree({
  rootCollection,
  selectedCollectionId,
  hasDataAccess,
  hasNativeWrite,
}: LibraryCollectionTreeProps) {
  const collectionTree = useMemo(
    () => buildCollectionTree([rootCollection]),
    [rootCollection],
  );

  const modelCollection = useMemo(
    () => getWritableCollection(rootCollection, "library-models"),
    [rootCollection],
  );

  const metricCollection = useMemo(
    () => getWritableCollection(rootCollection, "library-metrics"),
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
      TreeNode={ModelingSidebarTreeNode}
      rightSection={(item: ITreeNodeItem) => {
        if (item.id !== rootCollection.id) {
          return null;
        }

        const canCreateModel = hasDataAccess && modelCollection != null;
        const canCreateMetric = hasDataAccess && metricCollection != null;
        if (!canCreateModel && !canCreateMetric) {
          return null;
        }

        return (
          <CreateCardMenu
            modelCollectionId={modelCollection?.id}
            metricCollectionId={metricCollection?.id}
            canCreateModel={canCreateModel}
            canCreateMetric={canCreateMetric}
            canCreateNativeQuery={hasNativeWrite}
          />
        );
      }}
      role="tree"
      onSelect={handleCollectionSelect}
    />
  );
}
