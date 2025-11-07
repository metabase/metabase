import { useCallback, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Box, Button, Icon, Menu, Stack } from "metabase/ui";

import { ModelingSidebarSection } from "../ModelingSidebarSection";
import { ModelingSidebarTreeNode } from "../ModelingSidebarTreeNode";

import S from "./ModelingSidebarView.module.css";
import { SnippetsSection } from "./SnippetsSection";

interface ModelingSidebarViewProps {
  collections: ITreeNodeItem[];
  selectedCollectionId: string | number | undefined;
  selectedSnippetId?: number;
  isGlossaryActive: boolean;
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
}

export function ModelingSidebarView({
  collections,
  selectedCollectionId,
  selectedSnippetId,
  isGlossaryActive,
  hasDataAccess,
  hasNativeWrite,
}: ModelingSidebarViewProps) {
  const dispatch = useDispatch();
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);

  const handleCollectionSelect = useCallback(
    (item: ITreeNodeItem) => {
      dispatch(push(Urls.dataStudioCollection(item.id)));
    },
    [dispatch],
  );

  const handleCreateModelNotebook = useCallback(() => {
    setIsCreateMenuOpen(false);
    dispatch(push(Urls.newDataStudioQueryModel()));
  }, [dispatch]);

  const handleCreateModelNative = useCallback(() => {
    setIsCreateMenuOpen(false);
    dispatch(push(Urls.newDataStudioNativeModel()));
  }, [dispatch]);

  const handleCreateMetric = useCallback(() => {
    setIsCreateMenuOpen(false);
    dispatch(push(Urls.newDataStudioMetric()));
  }, [dispatch]);

  return (
    <Box w={320} h="100%" bg="bg-white" className={S.sidebar}>
      <Stack gap="md" p="md">
        <Menu
          opened={isCreateMenuOpen}
          onChange={setIsCreateMenuOpen}
          position="bottom-end"
        >
          <ModelingSidebarSection
            icon="repository"
            title={t`Library`}
            rightSection={
              hasDataAccess && (
                <Menu.Target>
                  <Button
                    w={32}
                    h={32}
                    size="compact-md"
                    variant="filled"
                    leftSection={<Icon name="add" />}
                    aria-label={t`Create model or metric`}
                    onClick={() => setIsCreateMenuOpen(true)}
                  />
                </Menu.Target>
              )
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

        {hasNativeWrite && (
          <SnippetsSection selectedSnippetId={selectedSnippetId} />
        )}

        <ModelingSidebarSection
          icon="book_open"
          title={t`Glossary`}
          to={Urls.dataStudioGlossary()}
          isActive={isGlossaryActive}
        />
      </Stack>
    </Box>
  );
}
