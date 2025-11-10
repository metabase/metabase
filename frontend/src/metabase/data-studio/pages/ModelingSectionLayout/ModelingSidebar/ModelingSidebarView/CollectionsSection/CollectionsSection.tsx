import { type MouseEvent, useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Button, Icon, Menu, Tooltip } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

import { ModelingSidebarTreeNode } from "../../ModelingSidebarTreeNode";

interface CollectionsSectionProps {
  collections: ITreeNodeItem[];
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

  const initialExpandedIds = useMemo(() => ["root"], []);

  return (
    <Tree
      data={collections}
      selectedId={selectedCollectionId}
      initialExpandedIds={initialExpandedIds}
      onSelect={handleCollectionSelect}
      TreeNode={ModelingSidebarTreeNode}
      rightSection={(item: ITreeNodeItem) => {
        if (item.id !== "root" || !hasDataAccess) {
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
                  leftSection={<Icon name="add" size={16} />}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                  }}
                />
              </Menu.Target>
            </Tooltip>
            <Menu.Dropdown>
              {hasNativeWrite ? (
                <Menu.Sub>
                  <Menu.Sub.Target>
                    <Menu.Sub.Item leftSection={<Icon name="model" />}>
                      {t`Model`}
                    </Menu.Sub.Item>
                  </Menu.Sub.Target>
                  <Menu.Sub.Dropdown>
                    <Menu.Item
                      leftSection={<Icon name="notebook" />}
                      onClick={handleCreateModelNotebook}
                    >
                      {t`Query builder`}
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<Icon name="sql" />}
                      onClick={handleCreateModelNative}
                    >
                      {t`SQL query`}
                    </Menu.Item>
                  </Menu.Sub.Dropdown>
                </Menu.Sub>
              ) : (
                <Menu.Item
                  leftSection={<Icon name="model" />}
                  onClick={handleCreateModelNotebook}
                >
                  {t`Model`}
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={<Icon name="metric" />}
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
