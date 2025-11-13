import { type MouseEvent, useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { getAllExpandableIds } from "metabase/common/components/tree/utils";
import { ModelingSidebarTreeNode } from "metabase/data-studio/pages/ModelingSectionLayout/ModelingSidebar/ModelingSidebarTreeNode";
import { buildCollectionTree } from "metabase/entities/collections";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Button, FixedSizeIcon, Menu, Tooltip } from "metabase/ui";
import type { Collection, CollectionId } from "metabase-types/api";

type SemanticLayerCollectionTreeProps = {
  collection: Collection;
  selectedCollectionId: CollectionId | undefined;
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
};

export function SemanticLayerCollectionTree({
  collection,
  selectedCollectionId,
  hasDataAccess,
  hasNativeWrite,
}: SemanticLayerCollectionTreeProps) {
  const collectionTree = useMemo(
    () => buildCollectionTree([collection]),
    [collection],
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

  const handleCreateModelNotebook = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      dispatch(push(Urls.newDataStudioQueryModel()));
    },
    [dispatch],
  );

  const handleCreateModelNative = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      dispatch(push(Urls.newDataStudioNativeModel()));
    },
    [dispatch],
  );

  const handleCreateMetric = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      dispatch(push(Urls.newDataStudioMetric()));
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
        if (item.id !== collection.id || !hasDataAccess) {
          return null;
        }
        return (
          <Menu position="bottom-end">
            <Tooltip label={t`Create model or metric`}>
              <Menu.Target>
                <Button
                  w={24}
                  h={24}
                  size="compact-xs"
                  variant="subtle"
                  c="text-medium"
                  leftSection={<FixedSizeIcon name="add" size={16} />}
                  onClick={(event: MouseEvent) => {
                    event.stopPropagation();
                  }}
                />
              </Menu.Target>
            </Tooltip>
            <Menu.Dropdown>
              {hasNativeWrite ? (
                <Menu.Sub>
                  <Menu.Sub.Target>
                    <Menu.Sub.Item leftSection={<FixedSizeIcon name="model" />}>
                      {t`Model`}
                    </Menu.Sub.Item>
                  </Menu.Sub.Target>
                  <Menu.Sub.Dropdown>
                    <Menu.Item
                      leftSection={<FixedSizeIcon name="notebook" />}
                      onClick={handleCreateModelNotebook}
                    >
                      {t`Query builder`}
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<FixedSizeIcon name="sql" />}
                      onClick={handleCreateModelNative}
                    >
                      {t`SQL query`}
                    </Menu.Item>
                  </Menu.Sub.Dropdown>
                </Menu.Sub>
              ) : (
                <Menu.Item
                  leftSection={<FixedSizeIcon name="model" />}
                  onClick={handleCreateModelNotebook}
                >
                  {t`Model`}
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={<FixedSizeIcon name="metric" />}
                onClick={handleCreateMetric}
              >
                {t`Metric`}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        );
      }}
      role="tree"
    />
  );
}
