import type { Row } from "@tanstack/react-table";
import { type ReactNode, useEffect } from "react";
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
  type TreeTableColumnDef,
  TreeTableSkeleton,
} from "metabase/ui";
import type { CollectionId, IconName } from "metabase-types/api";

import { LibraryBulkActions } from "./LibraryBulkActions";
import { LibraryPageMenu, type LibraryPageMenuProps } from "./LibraryPageMenu";
import { useLibraryTreeTableInstance } from "./hooks";

const NO_EXPANDED_IDS: readonly string[] = [];

type LibraryTreePageProps = {
  title: string;
  /** Page-level tabs under the title */
  tabs?: ReactNode;
  tree: TreeItem[];
  isLoading: boolean;
  isSearchActive: boolean;
  searchQuery: string;
  emptyMessage: string;
  /** Shown in place of the default illustration when there are no items */
  emptyIcon?: IconName;
  /** Call to action shown under the empty message when there are no items */
  emptyAction?: ReactNode;
  /** Off when the section has nowhere to move items to; defaults to on */
  canMoveItems?: boolean;
  defaultExpandedIds?: readonly string[];
  defaultMoveCollectionIds?: Partial<Record<LibrarySection, CollectionId>>;
  createMenu?: ReactNode;
  pageMenu?: LibraryPageMenuProps;
  emptyState?: ReactNode;
  children?: ReactNode;
  renderRowMenu: (item: TreeItem) => ReactNode;
  isChildrenLoading?: (row: Row<TreeItem>) => boolean;
  onRowsChange?: (rows: Row<TreeItem>[]) => void;
  onSearchQueryChange: (searchQuery: string) => void;
  emptyStateActions?: Partial<Record<LibrarySectionType, () => void>>;
  /** Section-specific columns between the name and the update time */
  extraColumns?: TreeTableColumnDef<TreeItem>[];
  /** Section-specific columns after the update time, before the row menu */
  trailingColumns?: TreeTableColumnDef<TreeItem>[];
  getTrashMessage?: (
    section: LibrarySection,
    count: number,
  ) => string | undefined;
};

export function LibraryTreePage({
  title,
  tabs,
  tree,
  isLoading,
  isSearchActive,
  searchQuery,
  emptyMessage: defaultEmptyMessage,
  defaultExpandedIds = NO_EXPANDED_IDS,
  defaultMoveCollectionIds,
  createMenu,
  pageMenu,
  emptyState,
  children,
  renderRowMenu,
  isChildrenLoading,
  onRowsChange,
  onSearchQueryChange,
  emptyStateActions,
  getTrashMessage,
  emptyIcon,
  emptyAction,
  extraColumns,
  trailingColumns,
  canMoveItems,
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
      extraColumns,
      trailingColumns,
    });

  const {
    selectedItems,
    selectionSection,
    isAllTables,
    getSelectionState,
    getRowCovered,
    onCheckboxClick,
    onSelectAllClick,
    clear: clearSelection,
  } = useLibraryBulkSelection(allRows);

  const trimmedSearch = searchQuery.trim();
  useEffect(() => {
    clearSelection();
  }, [trimmedSearch, clearSelection]);

  useEffect(() => {
    onRowsChange?.(treeTableInstance.rows);
  }, [treeTableInstance.rows, onRowsChange]);

  return (
    <>
      <SectionLayout>
        <PaneHeader
          breadcrumbs={<DataStudioBreadcrumbs>{title}</DataStudioBreadcrumbs>}
          tabs={tabs}
          px="3.5rem"
          py={0}
          mb={tabs != null ? "lg" : undefined}
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
                {pageMenu && <LibraryPageMenu {...pageMenu} />}
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
                    onHeaderCheckboxClick={onSelectAllClick}
                    headerCheckboxAriaLabel={t`Select all`}
                    emptyState={
                      <ListEmptyState
                        label={emptyMessage}
                        icon={isSearchActive ? undefined : emptyIcon}
                        action={
                          isSearchActive || isRemoteSyncReadOnly
                            ? undefined
                            : emptyAction
                        }
                      />
                    }
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
          getTrashMessage={getTrashMessage}
          onClear={clearSelection}
          canMove={canMoveItems}
        />
      )}
    </>
  );
}
