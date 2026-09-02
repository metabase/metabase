import { useMemo } from "react";
import _ from "underscore";

import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import { PinnedItemSortDropTarget } from "metabase/collections/components/PinnedItemSortDropTarget";
import { CompactPinnedItemCard } from "metabase/common/collections/components/CompactPinnedItemCard";
import PinDropZone from "metabase/common/collections/components/PinDropZone";
import type {
  CreateBookmark,
  DeleteBookmark,
  OnToggleSelectedWithItem,
} from "metabase/common/collections/types";
import { isRootTrashCollection } from "metabase/common/collections/utils";
import { canSelectItems } from "metabase/common/components/ItemsTable/utils";
import { ItemDragSource } from "metabase/common/components/dnd/ItemDragSource";
import { Box, SimpleGrid, rem } from "metabase/ui";
import type {
  Bookmark,
  Collection,
  CollectionId,
  CollectionItem,
  Database,
} from "metabase-types/api";

import { useIsShiftPressed } from "./use-is-shift-pressed";

type Props = {
  databases?: Database[];
  bookmarks?: Bookmark[];
  createBookmark: CreateBookmark;
  deleteBookmark: DeleteBookmark;
  collectionId: CollectionId;
  collection: Collection;
  onCopy: (items: CollectionItem[]) => void;
  onMove: (items: CollectionItem[]) => void;
  selected: CollectionItem[];
  getIsSelected: (item: CollectionItem) => boolean;
  onToggleSelected: OnToggleSelectedWithItem;
};

export function PinnedItemsGrid({
  databases,
  bookmarks,
  createBookmark,
  deleteBookmark,
  collectionId,
  collection,
  onCopy,
  onMove,
  selected,
  getIsSelected,
  onToggleSelected,
}: Props) {
  // Trashed items keep their pin position, but the trash never shows a pinned section.
  const showPinnedItems = !isRootTrashCollection(collection);

  const { data: pinnedItemsData } = useListCollectionItemsQuery(
    showPinnedItems
      ? {
          id: collectionId,
          "pinned-state": "is_pinned",
          "sort-column": "name",
          "sort-direction": "asc",
        }
      : skipToken,
  );
  const canSelect = canSelectItems(collection, onToggleSelected);
  const isSelectMode = canSelect && selected.length > 0;
  const isShiftPressed = useIsShiftPressed(canSelect);
  const showSelectAffordance = canSelect && !isSelectMode && isShiftPressed;

  const sortedItems = useMemo(() => {
    const items = pinnedItemsData?.data ?? [];
    return _.sortBy(items, (item) => item.collection_position);
  }, [pinnedItemsData]);

  if (sortedItems.length === 0) {
    return (
      <Box mb={rem(48)} pos="relative">
        <PinDropZone variant="pin" empty />
      </Box>
    );
  }

  return (
    <Box mb={rem(48)} pos="relative" data-testid="pinned-items">
      <PinDropZone variant="pin" />
      <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
        {sortedItems.map((item, index) => {
          // collection_position isn't guaranteed unique, so drag and drop is
          // keyed by display index instead.
          const pinIndex = index + 1;
          const isSelected = getIsSelected(item);
          return (
            <Box key={`${item.model}-${item.id}`} pos="relative">
              <PinnedItemSortDropTarget
                isFrontTarget
                pinIndex={pinIndex}
                enableDropTargetBackground={false}
              />
              <ItemDragSource
                item={{ ...item, collection_position: pinIndex }}
                collection={collection}
                isSelected={isSelected}
                selected={selected}
              >
                {/* ItemDragSource needs a native DOM element to attach its drag ref */}
                <div data-drag-source-node>
                  <CompactPinnedItemCard
                    item={item}
                    collection={collection}
                    databases={databases}
                    bookmarks={bookmarks}
                    createBookmark={createBookmark}
                    deleteBookmark={deleteBookmark}
                    onCopy={onCopy}
                    onMove={onMove}
                    isSelectMode={isSelectMode}
                    isSelected={isSelected}
                    onToggleSelected={canSelect ? onToggleSelected : undefined}
                    showSelectAffordance={showSelectAffordance}
                  />
                </div>
              </ItemDragSource>
              <PinnedItemSortDropTarget
                isBackTarget
                pinIndex={pinIndex}
                enableDropTargetBackground={false}
              />
            </Box>
          );
        })}
      </SimpleGrid>
    </Box>
  );
}
