import type { Row } from "@tanstack/react-table";
import { type ReactNode, useCallback, useEffect } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import {
  type LibrarySection,
  useLibraryBulkSelection,
} from "metabase/data-studio/common/hooks/use-library-bulk-selection";
import type {
  LibrarySectionType,
  TreeItem,
} from "metabase/data-studio/common/types";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import {
  Card,
  Flex,
  Icon,
  Stack,
  TextInput,
  TreeTable,
  TreeTableSkeleton,
} from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

import { LibraryBulkActions } from "../LibraryBulkActions";

import { useLibraryTreeTableInstance } from "./use-library-tree-table-instance";

type LibraryTreePageProps = {
  title: string;
  tree: TreeItem[];
  isLoading: boolean;
  isSearchActive: boolean;
  searchQuery: string;
  emptyMessage: string;
  defaultExpandedIds: string[];
  defaultMoveCollectionIds?: Partial<Record<LibrarySection, CollectionId>>;
  createMenu?: ReactNode;
  emptyState?: ReactNode;
  children?: ReactNode;
  renderRowMenu: (item: TreeItem) => ReactNode;
  isChildrenLoading?: (row: Row<TreeItem>) => boolean;
  onRowsChange?: (rows: Row<TreeItem>[]) => void;
  onSearchQueryChange: (searchQuery: string) => void;
  emptyStateActions?: Partial<Record<LibrarySectionType, () => void>>;
  getTrashMessage?: (
    section: LibrarySection,
    count: number,
  ) => string | undefined;
  onBulkActionComplete?: (
    section: LibrarySection,
    affectedCollectionIds: CollectionId[],
  ) => void;
};

export function LibraryTreePage({
  title,
  tree,
  isLoading,
  isSearchActive,
  searchQuery,
  emptyMessage: defaultEmptyMessage,
  defaultExpandedIds,
  defaultMoveCollectionIds,
  createMenu,
  emptyState,
  children,
  renderRowMenu,
  isChildrenLoading,
  onRowsChange,
  onSearchQueryChange,
  emptyStateActions,
  getTrashMessage,
  onBulkActionComplete,
}: LibraryTreePageProps) {
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  const { treeTableInstance, allRows, emptyMessage } =
    useLibraryTreeTableInstance({
      tree,
      isLoading,
      isSearchActive,
      searchQuery,
      emptyMessage: defaultEmptyMessage,
      defaultExpandedIds,
      renderRowMenu,
      emptyStateActions,
    });

  const {
    selectedItems,
    selectionSection,
    isAllTables,
    getSelectionState,
    getRowCovered,
    onCheckboxClick,
    clear: clearSelection,
  } = useLibraryBulkSelection(allRows);

  const trimmedSearch = searchQuery.trim();
  useEffect(() => {
    clearSelection();
  }, [trimmedSearch, clearSelection]);

  useEffect(() => {
    onRowsChange?.(treeTableInstance.rows);
  }, [treeTableInstance.rows, onRowsChange]);

  const handleBulkActionComplete = useCallback(
    (section: LibrarySection, affectedCollectionIds: CollectionId[]) => {
      onBulkActionComplete?.(section, affectedCollectionIds);
      clearSelection();
    },
    [onBulkActionComplete, clearSelection],
  );

  return (
    <>
      <SectionLayout>
        <PaneHeader
          breadcrumbs={<DataStudioBreadcrumbs>{title}</DataStudioBreadcrumbs>}
          px="3.5rem"
          py={0}
        />
        <Stack
          bg="background_page-secondary"
          data-testid="library-page"
          pb="2rem"
          px="3.5rem"
          style={{ overflow: "hidden" }}
        >
          {emptyState ?? (
            <>
              <Flex gap="lg">
                <TextInput
                  placeholder={t`Search...`}
                  leftSection={<Icon name="search" />}
                  bdrs="sm"
                  flex="1"
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                />
                {!isRemoteSyncReadOnly && createMenu}
              </Flex>
              <Card withBorder p={0}>
                {isLoading ? (
                  <TreeTableSkeleton columnWidths={[0.6, 0.2, 0.05]} />
                ) : (
                  <TreeTable
                    instance={treeTableInstance}
                    showCheckboxes={!isRemoteSyncReadOnly}
                    getSelectionState={getSelectionState}
                    isRowDisabled={getRowCovered}
                    onCheckboxClick={onCheckboxClick}
                    emptyState={<ListEmptyState label={emptyMessage} />}
                    onRowClick={(row) => {
                      if (row.original.model === "empty-state") {
                        return;
                      }
                      if (row.getCanExpand()) {
                        row.toggleExpanded();
                      }
                      // Leaf navigation is handled by the name link in the cell
                    }}
                    isChildrenLoading={isChildrenLoading}
                  />
                )}
              </Card>
            </>
          )}
        </Stack>
      </SectionLayout>
      {children}
      {!isRemoteSyncReadOnly && (
        <LibraryBulkActions
          selectedItems={selectedItems}
          selectionSection={selectionSection}
          isAllTables={isAllTables}
          defaultCollectionId={
            selectionSection != null
              ? defaultMoveCollectionIds?.[selectionSection]
              : undefined
          }
          onActionComplete={handleBulkActionComplete}
          getTrashMessage={getTrashMessage}
          onClear={clearSelection}
        />
      )}
    </>
  );
}
