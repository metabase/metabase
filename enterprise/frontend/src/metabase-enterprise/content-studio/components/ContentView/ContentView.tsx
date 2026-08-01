import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  useCreateBookmarkMutation,
  useDeleteBookmarkMutation,
  useListBookmarksQuery,
  useListCollectionItemsQuery,
  useUpdateCollectionMutation,
} from "metabase/api";
import { CollectionBulkActions } from "metabase/collections/components/CollectionBulkActions";
import { CollectionItemsTable } from "metabase/collections/components/CollectionContent/CollectionItemsTable";
import { DEFAULT_VISIBLE_COLUMNS_LIST } from "metabase/collections/components/CollectionContent/constants";
import {
  CollectionEmptyIcon,
  EmptyStateSubtitle,
  EmptyStateTitle,
  EmptyStateWrapper,
} from "metabase/collections/components/CollectionEmptyState/CollectionEmptyState";
import { CollectionCaption } from "metabase/collections/components/CollectionHeader/CollectionCaption";
import { CollectionInfoSidebarToggle } from "metabase/collections/components/CollectionHeader/CollectionInfoSidebarToggle";
import PinnedItemOverview from "metabase/collections/components/PinnedItemOverview";
import type {
  CreateBookmark,
  DeleteBookmark,
} from "metabase/common/collections/types";
import { getVisibleColumnsMap } from "metabase/common/components/ItemsTable/utils";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { ItemsDragLayer } from "metabase/common/components/dnd/ItemsDragLayer";
import { useSetting } from "metabase/common/hooks";
import { useListSelect } from "metabase/common/hooks/use-list-select";
import { useSelector } from "metabase/redux";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { TransformHostProvider } from "metabase/transforms/host";
import { CreateTransformMenu } from "metabase/transforms/pages/TransformListPage/CreateTransformMenu";
import {
  Anchor,
  Box,
  Button,
  Center,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { useWorktrees } from "metabase-enterprise/remote_sync/hooks/use-worktrees";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { Collection, CollectionItem } from "metabase-types/api";

import { useScopeRootCollections } from "../../collection-tree";
import {
  type ContentStudioTarget,
  getSectionIcon,
  getSectionTitle,
  getTargetCollectionId,
  getTargetSection,
} from "../../content-target";
import { getContentStudioItemUrl } from "../../item-urls";
import { useLibrarySyncState } from "../../library-sync";
import { useContentStudioScope } from "../../scope";
import { useScopeSnippetFolder } from "../../snippet-tree";
import { useIsScopeImporting } from "../../sync-state";
import { useContentStudioTransformHost } from "../../transform-host";
import { useScopeTransformFolder } from "../../transform-tree";
import { BranchSyncProgress } from "../BranchSyncProgress";
import { ContentStudioOnboarding } from "../ContentStudioOnboarding";
import { CreateMenu } from "../CreateMenu";
import { FolderContents } from "../FolderContents";
import { NewCollectionModal } from "../NewCollectionModal";
import { RemoteSyncSetupState } from "../RemoteSyncSetupState";

const REMOTE_SYNC_SETTINGS_PATH = "/admin/settings/remote-sync";

const itemKeyFn = (item: CollectionItem) => `${item.id}:${item.model}`;

type ContentViewProps = {
  target: ContentStudioTarget;
};

/**
 * The one view Content Studio shows for a place that holds content, whether that
 * is a collection or the root of a namespace. Only the list of contents differs.
 */
export function ContentView({ target }: ContentViewProps) {
  const isRemoteSyncEnabled = useSetting("remote-sync-enabled");
  const isImporting = useIsScopeImporting();

  if (!isRemoteSyncEnabled) {
    return <RemoteSyncSetupState />;
  }

  if (isImporting) {
    return <BranchSyncProgress />;
  }

  return match(getTargetSection(target))
    .with("transforms", () => <TransformContents target={target} />)
    .with("snippets", () => <SnippetContents target={target} />)
    .with("collections", () => <CollectionContents target={target} />)
    .exhaustive();
}

function useCollectionRename() {
  const [updateCollection] = useUpdateCollectionMutation();

  return useCallback(
    (target: Collection, values: Partial<Collection>) => {
      updateCollection({
        id: target.id,
        name: values.name,
        description: values.description,
      });
    },
    [updateCollection],
  );
}

type ContentFrameProps = {
  target: ContentStudioTarget;
  actions?: ReactNode;
  children: ReactNode;
};

/** The chrome every content view shares: a title, its actions, and the contents. */
function ContentFrame({ target, actions, children }: ContentFrameProps) {
  const handleUpdateCollection = useCollectionRename();

  return (
    <>
      <ErrorBoundary>
        <Group justify="space-between" align="center" mb="2rem" pt="0.5rem">
          {target.kind === "collection" ? (
            <CollectionCaption
              collection={target.collection}
              onUpdateCollection={handleUpdateCollection}
            />
          ) : (
            <Group gap="sm" align="center">
              <Icon name={getSectionIcon(target.section)} size={24} />
              <Title order={2} fz="1.75rem" fw={900}>
                {getSectionTitle(target.section)}
              </Title>
            </Group>
          )}
          <Group gap="sm" align="center">
            {actions}
            {target.kind === "collection" && (
              <CollectionInfoSidebarToggle
                collection={target.collection}
                onUpdateCollection={handleUpdateCollection}
              />
            )}
          </Group>
        </Group>
      </ErrorBoundary>

      <ErrorBoundary>{children}</ErrorBoundary>
    </>
  );
}

type ContentTargetProps = {
  target: ContentStudioTarget;
};

type RootTargetProps = {
  target: Extract<ContentStudioTarget, { kind: "root" }>;
};

type SyncHintProps = {
  message: string;
};

function SyncHint({ message }: SyncHintProps) {
  return (
    <Stack gap="md" maw="35rem">
      <Text c="text-secondary">{message}</Text>
      <Group>
        <Button
          component={Link}
          to={REMOTE_SYNC_SETTINGS_PATH}
          variant="filled"
        >
          {t`Choose what to sync`}
        </Button>
      </Group>
    </Stack>
  );
}

function getTransformsEmptyMessage(isRoot: boolean, isMainScope: boolean) {
  if (!isRoot) {
    return t`This folder has no transforms yet.`;
  }
  return isMainScope
    ? t`No transforms yet.`
    : t`No content. Pull to load this branch.`;
}

function TransformContents({ target }: ContentTargetProps) {
  const { worktreeId } = useContentStudioScope();
  const areTransformsSynced = useSetting("remote-sync-transforms");
  const host = useContentStudioTransformHost();
  const { transformsDatabases = [] } = useTransformPermissions();
  const { items, isLoading, error } = useScopeTransformFolder(
    getTargetCollectionId(target),
  );

  const isMainScope = worktreeId == null;
  const isRoot = target.kind === "root";

  if (isRoot && isMainScope && !areTransformsSynced) {
    return (
      <ContentFrame target={target}>
        <SyncHint
          message={t`Transforms aren't part of remote sync yet. Turn on transform sync to manage them from here.`}
        />
      </ContentFrame>
    );
  }

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  return (
    <TransformHostProvider value={host}>
      <ContentFrame
        target={target}
        actions={
          // A transform is created at the root of its namespace, so offering it
          // from a folder would put the transform somewhere else than asked.
          isRoot &&
          transformsDatabases.length > 0 && (
            <CreateTransformMenu worktreeId={worktreeId} />
          )
        }
      >
        <FolderContents
          items={items}
          isLoading={isLoading}
          emptyState={
            <Text c="text-secondary">
              {getTransformsEmptyMessage(isRoot, isMainScope)}
            </Text>
          }
        />
      </ContentFrame>
    </TransformHostProvider>
  );
}

function getSnippetsEmptyMessage(isRoot: boolean, isMainScope: boolean) {
  if (!isRoot) {
    return t`This folder has no snippets yet.`;
  }
  return isMainScope
    ? t`No snippets yet.`
    : t`No content. Pull to load this branch.`;
}

function SnippetContents({ target }: ContentTargetProps) {
  const { worktreeId } = useContentStudioScope();
  const isReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const { items, isLoading } = useScopeSnippetFolder(
    getTargetCollectionId(target),
  );

  const isMainScope = worktreeId == null;
  const isRoot = target.kind === "root";
  const scope = worktreeId != null ? { worktreeId } : {};

  // Only the main branch's root has to explain that snippets follow the Library.
  const { isLibrarySynced, isLoading: isLoadingLibrary } = useLibrarySyncState({
    skip: !isRoot || !isMainScope,
  });

  if (isRoot && isMainScope && isLoadingLibrary) {
    return (
      <ContentFrame target={target}>
        <Center>
          <Loader size="sm" data-testid="loading-indicator" />
        </Center>
      </ContentFrame>
    );
  }

  if (isRoot && isMainScope && !isLibrarySynced) {
    return (
      <ContentFrame target={target}>
        <SyncHint
          message={t`Snippets are synced along with the Library. Turn on Library sync to manage them from here.`}
        />
      </ContentFrame>
    );
  }

  return (
    <ContentFrame
      target={target}
      actions={
        // A snippet is created at the root of its namespace, so offering it
        // from a folder would put the snippet somewhere else than asked.
        isRoot && (
          <>
            {(!isMainScope || !isReadOnly) && (
              <Button
                component={Link}
                to={Urls.contentStudioNewSnippet(scope)}
                variant="filled"
              >
                {t`New snippet`}
              </Button>
            )}
            <Button
              component={Link}
              to={Urls.contentStudioArchivedSnippets(scope)}
            >
              {t`Archived snippets`}
            </Button>
          </>
        )
      }
    >
      <FolderContents
        items={items}
        isLoading={isLoading}
        emptyState={
          <Text c="text-secondary">
            {getSnippetsEmptyMessage(isRoot, isMainScope)}
          </Text>
        }
      />
    </ContentFrame>
  );
}

function CollectionContents({ target }: ContentTargetProps) {
  if (target.kind === "collection") {
    return <CollectionItems target={target} />;
  }
  return <RootCollectionContents target={target} />;
}

function RootCollectionContents({ target }: RootTargetProps) {
  const { worktreeId } = useContentStudioScope();
  const isReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const { items, isLoading } = useScopeRootCollections();
  const { worktrees, isFetching: isFetchingWorktrees } = useWorktrees();
  const [isModalOpen, { open: openModal, close: closeModal }] =
    useDisclosure(false);

  const isMainScope = worktreeId == null;
  const hasNothingToShow =
    isMainScope &&
    !isLoading &&
    !isFetchingWorktrees &&
    items.length === 0 &&
    worktrees.length === 0;

  if (hasNothingToShow) {
    return (
      <ContentFrame target={target}>
        <ContentStudioOnboarding />
      </ContentFrame>
    );
  }

  return (
    <>
      <ContentFrame
        target={target}
        actions={
          (!isMainScope || !isReadOnly) && (
            <Button leftSection={<Icon name="add" />} onClick={openModal}>
              {t`New collection`}
            </Button>
          )
        }
      >
        <FolderContents
          items={items}
          isLoading={isLoading}
          emptyState={
            isMainScope ? (
              <Text c="text-secondary">
                {t`No collections are synced yet.`}{" "}
                <Anchor component={Link} to={REMOTE_SYNC_SETTINGS_PATH}>
                  {t`Choose what to sync`}
                </Anchor>
              </Text>
            ) : (
              <Text c="text-secondary">{t`No content. Pull to load this branch.`}</Text>
            )
          }
        />
      </ContentFrame>
      {isModalOpen && <NewCollectionModal onClose={closeModal} />}
    </>
  );
}

type CollectionTargetProps = {
  target: Extract<ContentStudioTarget, { kind: "collection" }>;
};

function CollectionItems({ target }: CollectionTargetProps) {
  const { collection } = target;
  const { data: bookmarks } = useListBookmarksQuery();
  const [createBookmarkMutation] = useCreateBookmarkMutation();
  const [deleteBookmarkMutation] = useDeleteBookmarkMutation();

  const createBookmark = useCallback<CreateBookmark>(
    (id, type) => {
      createBookmarkMutation({ id, type });
    },
    [createBookmarkMutation],
  );

  const deleteBookmark = useCallback<DeleteBookmark>(
    (id, type) => {
      deleteBookmarkMutation({ id, type });
    },
    [deleteBookmarkMutation],
  );

  const { data: pinnedItemsData, isLoading: isLoadingPinnedItems } =
    useListCollectionItemsQuery({
      id: collection.id,
      pinned_state: "is_pinned",
      sort_column: "name",
      sort_direction: "asc",
    });
  const pinnedItems = pinnedItemsData?.data ?? [];

  const { clear, getIsSelected, selected, selectOnlyTheseItems, toggleItem } =
    useListSelect(itemKeyFn);
  const [selectedItems, setSelectedItems] = useState<CollectionItem[] | null>(
    null,
  );
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const visibleColumnsMap = useMemo(
    () => getVisibleColumnsMap(DEFAULT_VISIBLE_COLUMNS_LIST),
    [],
  );

  const handleMove = useCallback((items: CollectionItem[]) => {
    setSelectedItems(items);
    setSelectedAction("move");
  }, []);

  const handleCopy = useCallback((items: CollectionItem[]) => {
    setSelectedItems(items);
    setSelectedAction("copy");
  }, []);

  return (
    <>
      <ContentFrame
        target={target}
        actions={<CreateMenu collection={collection} />}
      >
        <ErrorBoundary>
          <PinnedItemOverview
            bookmarks={bookmarks}
            createBookmark={createBookmark}
            deleteBookmark={deleteBookmark}
            items={pinnedItems}
            collection={collection}
            onCopy={handleCopy}
            onMove={handleMove}
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <CollectionItemsTable
            collectionId={collection.id}
            collection={collection}
            bookmarks={bookmarks}
            createBookmark={createBookmark}
            deleteBookmark={deleteBookmark}
            loadingPinnedItems={isLoadingPinnedItems}
            hasPinnedItems={pinnedItems.length > 0}
            getItemUrl={getContentStudioItemUrl}
            EmptyContentComponent={ContentStudioCollectionEmptyState}
            getIsSelected={getIsSelected}
            selected={selected}
            selectOnlyTheseItems={selectOnlyTheseItems}
            toggleItem={toggleItem}
            clear={clear}
            handleMove={handleMove}
            handleCopy={handleCopy}
          />
          <CollectionBulkActions
            collection={collection}
            selected={selected}
            clearSelected={clear}
            selectedItems={selectedItems}
            setSelectedItems={setSelectedItems}
            selectedAction={selectedAction}
            setSelectedAction={setSelectedAction}
          />
        </ErrorBoundary>
      </ContentFrame>

      <ItemsDragLayer
        selectedItems={selected}
        pinnedItems={pinnedItems}
        collection={collection}
        visibleColumnsMap={visibleColumnsMap}
      />
    </>
  );
}

function ContentStudioCollectionEmptyState() {
  return (
    <Box mt="calc(20vh - 3.5rem)">
      <EmptyStateWrapper>
        <CollectionEmptyIcon />
        <EmptyStateTitle>{t`This collection is empty`}</EmptyStateTitle>
        <EmptyStateSubtitle>
          {t`Use collections to organize questions, dashboards, models, and other collections.`}
        </EmptyStateSubtitle>
      </EmptyStateWrapper>
    </Box>
  );
}
