import { t } from "ttag";
import _ from "underscore";

import type { OnMoveWithOneItem } from "metabase/collections/types";
import { isItemCollection } from "metabase/collections/utils";
import {
  CollectionPickerModal,
  type CollectionPickerItem,
} from "metabase/common/components/CollectionPicker";
import type {
  CollectionId,
  CollectionItem,
  RecentItem,
  SearchResult,
} from "metabase-types/api";

interface MoveModalProps {
  title: string;
  onClose: () => void;
  onMove: OnMoveWithOneItem;
  initialCollectionId: CollectionId;
  movingCollectionId?: CollectionId;
}

const makeRecentFilter = (
  disableFn: ((item: CollectionPickerItem) => boolean) | undefined,
) => {
  return (recentItems: RecentItem[]) =>
    recentItems.filter(
      result => !disableFn?.(result as CollectionPickerItem) ?? true,
    );
};

const makeSearchResultFilter = (
  disableFn: ((item: CollectionPickerItem) => boolean) | undefined,
) => {
  return (searchResults: SearchResult[]) =>
    searchResults.filter(
      result => !disableFn?.(result as CollectionPickerItem) ?? true,
    );
};

export const MoveModal = ({
  title,
  onClose,
  onMove,
  initialCollectionId,
  movingCollectionId,
}: MoveModalProps) => {
  // if we are moving a collection, we can't move it into itself or any of its children
  const shouldDisableItem = movingCollectionId
    ? (item: CollectionPickerItem) =>
        Boolean(
          item.id === movingCollectionId ||
            (item.effective_location ?? item?.location)
              ?.split("/")
              .includes(String(movingCollectionId)),
        )
    : undefined;

  const searchResultFilter = makeSearchResultFilter(shouldDisableItem);
  const recentFilter = makeRecentFilter(shouldDisableItem);

  return (
    <CollectionPickerModal
      title={title}
      value={{
        id: initialCollectionId,
        model: "collection",
      }}
      onChange={async newCollection => await onMove({ id: newCollection.id })}
      options={{
        showSearch: true,
        allowCreateNew: true,
        hasConfirmButtons: true,
        showRootCollection: true,
        showPersonalCollections: true,
        confirmButtonText: t`Move`,
      }}
      shouldDisableItem={shouldDisableItem}
      searchResultFilter={searchResultFilter}
      recentFilter={recentFilter}
      onClose={onClose}
    />
  );
};

interface BulkMoveModalProps {
  onClose: () => void;
  onMove: OnMoveWithOneItem;
  selectedItems: CollectionItem[];
  initialCollectionId: CollectionId;
}

export const BulkMoveModal = ({
  onClose,
  onMove,
  selectedItems,
  initialCollectionId,
}: BulkMoveModalProps) => {
  const movingCollectionIds = selectedItems
    .filter((item: CollectionItem) => isItemCollection(item))
    .map((item: CollectionItem) => String(item.id));

  // if the move set includes collections, we can't move into any of them
  const shouldDisableItem = movingCollectionIds.length
    ? (item: CollectionPickerItem) => {
        const collectionItemFullPath =
          (item?.effective_location ?? item?.location)
            ?.split("/")
            .map(String)
            .concat(String(item.id)) ?? [];
        return (
          _.intersection(collectionItemFullPath, movingCollectionIds).length > 0
        );
      }
    : undefined;

  const searchResultFilter = makeSearchResultFilter(shouldDisableItem);
  const recentFilter = makeRecentFilter(shouldDisableItem);

  const title =
    selectedItems.length > 1
      ? t`Move ${selectedItems.length} items?`
      : t`Move "${selectedItems[0].name}"?`;

  return (
    <CollectionPickerModal
      title={title}
      value={{
        id: initialCollectionId,
        model: "collection",
      }}
      onChange={newCollection => onMove({ id: newCollection.id })}
      options={{
        showSearch: true,
        allowCreateNew: true,
        hasConfirmButtons: true,
        showRootCollection: true,
        showPersonalCollections: true,
        confirmButtonText: t`Move`,
      }}
      shouldDisableItem={shouldDisableItem}
      searchResultFilter={searchResultFilter}
      recentFilter={recentFilter}
      onClose={onClose}
    />
  );
};
