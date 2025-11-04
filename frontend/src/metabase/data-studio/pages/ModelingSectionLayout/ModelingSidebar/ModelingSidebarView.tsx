import { useCallback, useState } from "react";
import { push } from "react-router-redux";
import { useLocation } from "react-use";
import { t } from "ttag";

import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type { CollectionTreeItem } from "metabase/entities/collections";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { ActionIcon, Box, Icon, Menu, Stack } from "metabase/ui";

import { ModelingSidebarSection } from "./ModelingSidebarSection";
import { ModelingSidebarTreeNode } from "./ModelingSidebarTreeNode";
import S from "./ModelingSidebarView.module.css";

interface ModelingSidebarViewProps {
  collections: CollectionTreeItem[];
}

export function ModelingSidebarView({ collections }: ModelingSidebarViewProps) {
  const location = useLocation();
  const dispatch = useDispatch();
  const [selectedCollectionId, setSelectedCollectionId] = useState<
    string | number | undefined
  >(undefined);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);

  const pathname = location.pathname || "";
  const isGlossaryActive = pathname.includes("/modeling/glossary");

  const handleCollectionSelect = useCallback(
    (item: ITreeNodeItem) => {
      setSelectedCollectionId(item.id);
      dispatch(push(`/data-studio/modeling/collections/${item.id}`));
    },
    [dispatch],
  );

  const handleCreateNotebook = useCallback(() => {
    setIsCreateMenuOpen(false);
    dispatch(push(Urls.newDataStudioQueryModel()));
  }, [dispatch]);

  const handleCreateNative = useCallback(() => {
    setIsCreateMenuOpen(false);
    dispatch(push(Urls.newDataStudioNativeModel()));
  }, [dispatch]);

  return (
    <Box w={280} h="100%" bg="bg-white" className={S.sidebar}>
      <Stack gap="lg" p="md">
        <Menu
          opened={isCreateMenuOpen}
          onChange={setIsCreateMenuOpen}
          position="bottom-end"
        >
          <ModelingSidebarSection
            icon="folder"
            title={t`Library`}
            action={{
              icon: "add",
              label: t`Create model`,
              onClick: () => setIsCreateMenuOpen(true),
            }}
            actionTarget={
              <Menu.Target>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  aria-label={t`Create model`}
                  ml="auto"
                >
                  <Icon name="add" size={16} />
                </ActionIcon>
              </Menu.Target>
            }
          >
            <Tree
              data={collections}
              selectedId={selectedCollectionId}
              onSelect={handleCollectionSelect}
              TreeNode={ModelingSidebarTreeNode}
              role="tree"
              aria-label="modeling-collections-tree"
            />
          </ModelingSidebarSection>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Icon name="notebook" />}
              onClick={handleCreateNotebook}
            >
              {t`Notebook`}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="sql" />}
              onClick={handleCreateNative}
            >
              {t`Native query`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>

        <ModelingSidebarSection
          icon="label"
          title={t`Glossary`}
          to="/data-studio/modeling/glossary"
          isActive={isGlossaryActive}
        />
      </Stack>
    </Box>
  );
}
