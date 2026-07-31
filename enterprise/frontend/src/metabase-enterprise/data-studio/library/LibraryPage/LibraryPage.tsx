import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useListCollectionsTreeQuery } from "metabase/api";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useHasTokenFeature } from "metabase/common/hooks";
import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import { LibraryUpsellPage } from "metabase/data-studio/upsells/pages";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { replace, useRouter } from "metabase/router";
import {
  Card,
  Flex,
  Icon,
  Stack,
  TextInput,
  TreeTable,
  TreeTableSkeleton,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { CollectionId, RemoteSyncWorktreeId } from "metabase-types/api";

import { LibraryEmptyState } from "../components/LibraryEmptyState";
import { useGetLibraryCollection } from "../utils";

import { CreateMenu } from "./components/CreateMenu";
import { LibraryBulkActions } from "./components/LibraryBulkActions";
import { PublishTableModal } from "./components/PublishTableModal";
import { useLibraryCollections, useLibraryTreeTableInstance } from "./hooks";
import type { LibrarySection } from "./hooks/library-bulk-selection.utils";
import { useLibraryBulkSelection } from "./hooks/useLibraryBulkSelection";
import { getWritableCollection } from "./utils";

export function LibraryPage() {
  const hasLibraryFeature = useHasTokenFeature("library");

  if (!hasLibraryFeature) {
    return <LibraryUpsellPage />;
  }

  return <LibraryPageContent />;
}

function LibraryPageContent() {
  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const dispatch = useDispatch();
  const { location } = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  // Non-null when an admin is viewing a remote-sync worktree's copy of the library instead of
  // the main app's. URL-backed so the selection survives navigating to a create page and back.
  const worktreeId = Urls.extractEntityId(location.query?.worktreeId) ?? null;
  const isWorktreeView = worktreeId != null;
  const handleWorktreeChange = useCallback(
    (nextWorktreeId: RemoteSyncWorktreeId | null) => {
      dispatch(
        replace(
          Urls.dataStudioLibrary(
            nextWorktreeId != null ? { worktreeId: nextWorktreeId } : {},
          ),
        ),
      );
    },
    [dispatch],
  );
  const [
    showPublishTableModal,
    { open: openPublishTableModal, close: closePublishTableModal },
  ] = useDisclosure(false);
  const { data: collections = [], isLoading: isLoadingCollections } =
    useListCollectionsTreeQuery({
      "exclude-other-user-collections": true,
      "exclude-archived": true,
      "include-library": true,
      ...(isWorktreeView && { "worktree-id": worktreeId }),
    });
  // A worktree holds a copy of the library only when the main app's library is
  // remote-synced, so the worktree switcher is pointless otherwise.
  const { data: mainLibrary } = useGetLibraryCollection();
  const isLibrarySynced = !!mainLibrary?.is_remote_synced;
  const {
    treeTableInstance,
    allRows,
    isChildrenLoading,
    isLoading,
    emptyMessage,
    refreshTableCollections,
    refreshMetricCollections,
  } = useLibraryTreeTableInstance({
    collections,
    isLoadingCollections,
    searchQuery,
    worktreeId: worktreeId ?? undefined,
    onPublishTableClick: openPublishTableModal,
  });

  const { libraryCollection, tableCollection, metricCollection } =
    useLibraryCollections(collections);
  const writableMetricCollection = useMemo(
    () =>
      libraryCollection &&
      getWritableCollection(libraryCollection, "library-metrics"),
    [libraryCollection],
  );

  const {
    selectedItems,
    selectionSection,
    isAllTables,
    getSelectionState,
    getRowCovered,
    onCheckboxClick,
    clear: clearSelection,
  } = useLibraryBulkSelection(allRows);

  // Clear selection when changing search query
  const trimmedSearch = searchQuery.trim();
  useEffect(() => {
    clearSelection();
  }, [trimmedSearch, clearSelection]);

  const moveDefaultCollectionId = match(selectionSection)
    .with("data", () => tableCollection?.id)
    .with("metrics", () => metricCollection?.id)
    .otherwise(() => undefined);

  const handleActionComplete = useCallback(
    (section: LibrarySection, affectedCollectionIds: CollectionId[]) => {
      if (section === "data") {
        refreshTableCollections(affectedCollectionIds);
      } else if (section === "metrics") {
        refreshMetricCollections(affectedCollectionIds);
      }
      // Snippet sections refetch via RTK tag invalidation.
      clearSelection();
    },
    [refreshTableCollections, refreshMetricCollections, clearSelection],
  );

  return (
    <>
      <SectionLayout>
        <PaneHeader
          breadcrumbs={
            <DataStudioBreadcrumbs>{t`Library`}</DataStudioBreadcrumbs>
          }
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
          {!libraryCollection && !isLoadingCollections && !isWorktreeView ? (
            <LibraryEmptyState />
          ) : (
            <>
              <Flex gap="md">
                <TextInput
                  placeholder={t`Search...`}
                  leftSection={<Icon name="search" />}
                  bdrs="md"
                  flex="1"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {isLibrarySynced && (
                  <PLUGIN_REMOTE_SYNC.WorktreeSwitcher
                    value={worktreeId}
                    onChange={handleWorktreeChange}
                  />
                )}
                <CreateMenu
                  metricCollectionId={writableMetricCollection?.id}
                  canWriteToMetricCollection={!!writableMetricCollection}
                  dataCollectionId={tableCollection?.id}
                  canWriteToDataCollection={!!tableCollection?.can_write}
                  worktreeId={worktreeId}
                />
              </Flex>
              <Card withBorder p={0}>
                {isLoading ? (
                  <TreeTableSkeleton columnWidths={[0.6, 0.2, 0.05]} />
                ) : (
                  <TreeTable
                    instance={treeTableInstance}
                    showCheckboxes={!isRemoteSyncReadOnly && !isWorktreeView}
                    getSelectionState={getSelectionState}
                    isRowDisabled={getRowCovered}
                    onCheckboxClick={onCheckboxClick}
                    emptyState={
                      emptyMessage ? (
                        <ListEmptyState label={emptyMessage} />
                      ) : null
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
      <PublishTableModal
        opened={showPublishTableModal}
        onClose={closePublishTableModal}
        onPublished={closePublishTableModal}
      />
      {!isRemoteSyncReadOnly && !isWorktreeView && (
        <LibraryBulkActions
          selectedItems={selectedItems}
          selectionSection={selectionSection}
          isAllTables={isAllTables}
          defaultCollectionId={moveDefaultCollectionId}
          onActionComplete={handleActionComplete}
          onClear={clearSelection}
        />
      )}
    </>
  );
}
