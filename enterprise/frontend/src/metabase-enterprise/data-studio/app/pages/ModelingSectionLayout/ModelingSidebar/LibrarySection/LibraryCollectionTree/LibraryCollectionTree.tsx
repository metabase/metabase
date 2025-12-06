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
};

export function LibraryCollectionTree({
  rootCollection,
  selectedCollectionId,
  hasDataAccess,
}: LibraryCollectionTreeProps) {
  const collectionTree = useMemo(
    () => buildCollectionTree([rootCollection]),
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

        const canCreateMetric = hasDataAccess && metricCollection != null;
        if (!canCreateMetric) {
          return null;
        }

        return <CreateCardMenu metricCollectionId={metricCollection?.id} />;
      }}
      role="tree"
      onSelect={handleCollectionSelect}
    />
  );
}
