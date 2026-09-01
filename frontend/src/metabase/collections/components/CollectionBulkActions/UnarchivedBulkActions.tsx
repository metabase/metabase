import { c, t } from "ttag";

import { BulkActionButton } from "metabase/common/components/BulkActionBar";
import { Icon, Menu } from "metabase/ui";
import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";

import { useBulkBookmark } from "./use-bulk-bookmark";
import { useBulkDuplicate } from "./use-bulk-duplicate";
import { useBulkPin } from "./use-bulk-pin";

type UnarchivedBulkActionsProps = {
  selected: CollectionItem[];
  collection: Collection;
  bookmarks: Bookmark[];
  clearSelected: () => void;
  onRequestMove?: () => void;
  onRequestTrash?: () => void;
};

export const UnarchivedBulkActions = ({
  selected,
  collection,
  bookmarks,
  clearSelected,
  onRequestMove,
  onRequestTrash,
}: UnarchivedBulkActionsProps) => {
  const {
    hasPinned,
    hasUnpinned,
    canPinAll,
    canUnpinAll,
    pinSelected,
    unpinSelected,
  } = useBulkPin(selected, collection);
  const { canBookmark, bookmarkSelected } = useBulkBookmark(
    selected,
    bookmarks,
  );
  const { canDuplicate, duplicateSelected } = useBulkDuplicate(
    selected,
    collection,
  );

  const handlePinAll = () => {
    pinSelected().finally(clearSelected);
  };

  const handleUnpinAll = () => {
    unpinSelected().finally(clearSelected);
  };

  const handleBookmark = () => {
    bookmarkSelected().finally(clearSelected);
  };

  const handleDuplicate = () => {
    duplicateSelected().finally(clearSelected);
  };

  const isPinnedOnly = hasPinned && !hasUnpinned;
  const isMixed = hasPinned && hasUnpinned;

  return (
    <>
      {isPinnedOnly ? (
        <BulkActionButton
          disabled={!canUnpinAll}
          onClick={handleUnpinAll}
        >{t`Unpin all`}</BulkActionButton>
      ) : (
        <BulkActionButton
          disabled={onRequestMove == null}
          onClick={onRequestMove}
        >{t`Move`}</BulkActionButton>
      )}
      <Menu position="top-end">
        <Menu.Target>
          <BulkActionButton aria-label={t`More actions`} px="sm">
            <Icon name="ellipsis" />
          </BulkActionButton>
        </Menu.Target>
        <Menu.Dropdown data-testid="bulk-actions-menu">
          {isPinnedOnly && (
            <Menu.Item
              leftSection={<Icon name="move" aria-hidden />}
              disabled={onRequestMove == null}
              onClick={onRequestMove}
            >
              {t`Move`}
            </Menu.Item>
          )}
          {hasUnpinned && (
            <Menu.Item
              leftSection={<Icon name="pin" aria-hidden />}
              disabled={!canPinAll}
              onClick={handlePinAll}
            >
              {t`Pin all`}
            </Menu.Item>
          )}
          {isMixed && (
            <Menu.Item
              leftSection={<Icon name="unpin" aria-hidden />}
              disabled={!canUnpinAll}
              onClick={handleUnpinAll}
            >
              {t`Unpin all`}
            </Menu.Item>
          )}
          <Menu.Item
            leftSection={<Icon name="bookmark" aria-hidden />}
            disabled={!canBookmark}
            onClick={handleBookmark}
          >
            {c("Verb").t`Bookmark`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="clone" aria-hidden />}
            disabled={!canDuplicate}
            onClick={handleDuplicate}
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
            disabled={onRequestTrash == null}
            onClick={onRequestTrash}
          >
            {t`Move to trash`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  );
};
