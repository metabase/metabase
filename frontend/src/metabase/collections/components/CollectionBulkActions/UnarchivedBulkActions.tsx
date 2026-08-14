import { useMemo } from "react";
import { c, msgid, ngettext, t } from "ttag";

import {
  useCopyDashboardMutation,
  useCopyDocumentMutation,
  useCreateBookmarkMutation,
} from "metabase/api";
import { archiveAndTrack } from "metabase/archive/analytics";
import { type ArchivableItem, useSetArchive } from "metabase/archive/hooks";
import { trackCollectionItemBookmarked } from "metabase/common/collections/analytics";
import {
  canArchiveItem,
  canBookmarkItem,
  canCopyItem,
  canonicalCollectionId,
  getItemBookmarkType,
  isItemBookmarked,
  isItemPinned,
} from "metabase/common/collections/utils";
import { BulkActionButton } from "metabase/common/components/BulkActionBar";
import {
  canMoveItem,
  canPinItem,
  isPinnable,
  useSetPinned,
} from "metabase/common/hooks";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { Icon, Menu } from "metabase/ui";
import type {
  Bookmark,
  Collection,
  CollectionItem,
  CollectionItemModel,
} from "metabase-types/api";

type UnarchivedBulkActionsProps = {
  selected: CollectionItem[];
  collection: Collection;
  bookmarks: Bookmark[];
  clearSelected: () => void;
  setSelectedItems: (items: CollectionItem[] | null) => void;
  setSelectedAction: (action: string) => void;
};

const ARCHIVABLE_MODELS: ReadonlySet<CollectionItemModel> = new Set([
  "card",
  "dataset",
  "metric",
  "dashboard",
  "collection",
  "document",
  "snippet",
  "exploration",
]);

function isArchivableItem(
  item: CollectionItem,
): item is CollectionItem & ArchivableItem {
  return ARCHIVABLE_MODELS.has(item.model);
}

export const UnarchivedBulkActions = ({
  selected,
  collection,
  bookmarks,
  clearSelected,
  setSelectedItems,
  setSelectedAction,
}: UnarchivedBulkActionsProps) => {
  const dispatch = useDispatch();
  const archive = useSetArchive();
  const setPinned = useSetPinned();
  const [createBookmark] = useCreateBookmarkMutation();
  const [copyDashboard] = useCopyDashboardMutation();
  const [copyDocument] = useCopyDocumentMutation();

  const pinnedItems = useMemo(() => selected.filter(isItemPinned), [selected]);
  const unpinnedItems = useMemo(
    () => selected.filter((item) => !isItemPinned(item)),
    [selected],
  );

  // archive
  const canArchive = useMemo(() => {
    return selected.every((item) => canArchiveItem(item, collection));
  }, [selected, collection]);

  const handleBulkArchive = async () => {
    const actions = selected.filter(isArchivableItem).map((item) => {
      return archiveAndTrack({
        archive: async () => {
          await archive(item, true, { notify: false });
        },
        model: item.model,
        modelId: item.id,
        triggeredFrom: "collection",
      });
    });

    Promise.all(actions).finally(() => clearSelected());
  };

  // move
  const canMove = useMemo(() => {
    return selected.every((item) => canMoveItem(item, collection));
  }, [selected, collection]);

  const handleBulkMoveStart = () => {
    setSelectedItems(selected);
    setSelectedAction("move");
  };

  // pin
  const canPinAll = useMemo(() => {
    return unpinnedItems.every((item) => canPinItem(item, collection));
  }, [unpinnedItems, collection]);

  const canUnpinAll = useMemo(() => {
    return pinnedItems.every((item) => canPinItem(item, collection));
  }, [pinnedItems, collection]);

  const handleBulkPin = () => {
    const actions = unpinnedItems
      .filter(isPinnable)
      .map((item) => setPinned(item, true));
    Promise.all(actions).finally(() => clearSelected());
  };

  const handleBulkUnpin = () => {
    const actions = pinnedItems
      .filter(isPinnable)
      .map((item) => setPinned(item, false));
    Promise.all(actions).finally(() => clearSelected());
  };

  // bookmark
  const canBookmark = useMemo(() => {
    return selected.every(canBookmarkItem);
  }, [selected]);

  const handleBulkBookmark = () => {
    const actions = selected
      .filter((item) => !isItemBookmarked(item, bookmarks))
      .map((item) => {
        trackCollectionItemBookmarked(item);
        return createBookmark({ id: item.id, type: getItemBookmarkType(item) });
      });
    Promise.all(actions).finally(() => clearSelected());
  };

  // duplicate
  const canDuplicate = useMemo(() => {
    return selected.every(canCopyItem);
  }, [selected]);

  const handleBulkDuplicate = async () => {
    const collectionId = canonicalCollectionId(collection.id);
    const itemsToCopy = selected.filter(canCopyItem);
    try {
      await Promise.all(
        itemsToCopy.map((item) => {
          const name = `${item.name} - ${t`Duplicate`}`;
          if (item.model === "dashboard") {
            return copyDashboard({
              id: item.id,
              name,
              collection_id: collectionId,
              is_deep_copy: false,
            }).unwrap();
          }
          return copyDocument({
            id: item.id,
            name,
            collection_id: collectionId,
          }).unwrap();
        }),
      );
      dispatch(
        addUndo({
          message: ngettext(
            msgid`${itemsToCopy.length} item has been duplicated.`,
            `${itemsToCopy.length} items have been duplicated.`,
            itemsToCopy.length,
          ),
          canDismiss: true,
        }),
      );
    } catch {
      dispatch(
        addUndo({ message: t`There was an error duplicating these items.` }),
      );
    } finally {
      clearSelected();
    }
  };

  useRegisterShortcut(
    [
      {
        id: "collection-send-items-to-trash",
        perform: () => {
          handleBulkArchive();
        },
      },
    ],
    [selected],
  );

  const hasPinned = pinnedItems.length > 0;
  const hasUnpinned = unpinnedItems.length > 0;
  const isMixed = hasPinned && hasUnpinned;

  // Per the redesign spec, only selections containing pinned items get the
  // overflow bar; an all-unpinned selection keeps the flat bar it has today.
  if (!hasPinned) {
    return (
      <>
        <BulkActionButton
          disabled={!canMove}
          onClick={handleBulkMoveStart}
        >{t`Move`}</BulkActionButton>
        <BulkActionButton
          disabled={!canArchive}
          onClick={handleBulkArchive}
        >{t`Move to trash`}</BulkActionButton>
      </>
    );
  }

  return (
    <>
      {isMixed ? (
        <BulkActionButton
          disabled={!canMove}
          onClick={handleBulkMoveStart}
        >{t`Move`}</BulkActionButton>
      ) : (
        <BulkActionButton
          disabled={!canUnpinAll}
          onClick={handleBulkUnpin}
        >{t`Unpin all`}</BulkActionButton>
      )}
      <Menu position="top-end">
        <Menu.Target>
          <BulkActionButton aria-label={t`More actions`} px="sm">
            <Icon name="ellipsis" />
          </BulkActionButton>
        </Menu.Target>
        <Menu.Dropdown data-testid="bulk-actions-menu">
          {isMixed ? (
            <>
              <Menu.Item
                leftSection={<Icon name="pin" aria-hidden />}
                disabled={!canPinAll}
                onClick={handleBulkPin}
              >
                {t`Pin all`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="unpin" aria-hidden />}
                disabled={!canUnpinAll}
                onClick={handleBulkUnpin}
              >
                {t`Unpin all`}
              </Menu.Item>
            </>
          ) : (
            <Menu.Item
              leftSection={<Icon name="move" aria-hidden />}
              disabled={!canMove}
              onClick={handleBulkMoveStart}
            >
              {t`Move`}
            </Menu.Item>
          )}
          <Menu.Item
            leftSection={<Icon name="bookmark" aria-hidden />}
            disabled={!canBookmark}
            onClick={handleBulkBookmark}
          >
            {c("Verb").t`Bookmark`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="clone" aria-hidden />}
            disabled={!canDuplicate}
            onClick={handleBulkDuplicate}
          >
            {c("Verb").t`Duplicate`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="close" aria-hidden />}
            onClick={clearSelected}
          >
            {t`Deselect all`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="trash" aria-hidden />}
            disabled={!canArchive}
            onClick={handleBulkArchive}
          >
            {t`Move to trash`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  );
};
