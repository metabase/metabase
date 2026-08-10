import { useMemo } from "react";
import _ from "underscore";

import { useListCollectionItemsQuery } from "metabase/api";
import { PinnedItemSortDropTarget } from "metabase/collections/components/PinnedItemSortDropTarget";
import { CompactPinnedItemCard } from "metabase/common/collections/components/CompactPinnedItemCard";
import PinDropZone from "metabase/common/collections/components/PinDropZone";
import type {
  CreateBookmark,
  DeleteBookmark,
} from "metabase/common/collections/types";
import { isRootTrashCollection } from "metabase/common/collections/utils";
import { ItemDragSource } from "metabase/common/components/dnd/ItemDragSource";
import { Box, SimpleGrid, rem } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  Bookmark,
  Collection,
  CollectionId,
  CollectionItem,
} from "metabase-types/api";

type Props = {
  databases?: Database[];
  bookmarks?: Bookmark[];
  createBookmark: CreateBookmark;
  deleteBookmark: DeleteBookmark;
  collectionId: CollectionId;
  collection: Collection;
  onCopy: (items: CollectionItem[]) => void;
  onMove: (items: CollectionItem[]) => void;
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
}: Props) {
  const { data: pinnedItemsData } = useListCollectionItemsQuery({
    id: collectionId,
    pinned_state: "is_pinned",
    sort_column: "name",
    sort_direction: "asc",
  });

  const sortedItems = useMemo(() => {
    // Trashed items keep their pin position, but the trash never shows a pinned section.
    if (isRootTrashCollection(collection)) {
      return [];
    }
    const items = pinnedItemsData?.data ?? [];
    return _.sortBy(items, (item) => item.collection_position);
  }, [pinnedItemsData, collection]);

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
