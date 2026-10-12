import { archiveAndTrack } from "metabase/archive/analytics";
import {
  moveCollectionItemAndTrack,
  setCollectionItemPinnedAndTrack,
} from "metabase/common/collections/analytics";
import {
  isItemPinned,
  isRootTrashCollection,
} from "metabase/common/collections/utils";
import {
  type MovableItem,
  type PinnableItem,
  isMovable,
  isPinnable,
} from "metabase/common/hooks";
import type { Collection, CollectionItem } from "metabase-types/api";

export type ItemDropResult = {
  collection?: Collection;
  pinIndex?: number | null;
};

type HandleItemDropProps = {
  items: CollectionItem[];
  dropResult: ItemDropResult;
  setPinned: (
    item: PinnableItem,
    pinned: boolean | number,
  ) => PromiseLike<unknown>;
  setCollection: (
    item: MovableItem,
    destination: { id: Collection["id"] },
  ) => Promise<unknown>;
};

export async function handleItemDrop({
  items,
  dropResult: { collection, pinIndex },
  setPinned,
  setCollection,
}: HandleItemDropProps): Promise<boolean> {
  if (collection !== undefined) {
    const movableItems = items.filter(isMovable);
    if (movableItems.length !== items.length) {
      return false;
    }

    await Promise.all(
      movableItems.map((item) => {
        if (isRootTrashCollection(collection)) {
          return archiveAndTrack({
            archive: async () => {
              await setCollection(item, collection);
            },
            model: item.model,
            modelId: item.id,
            triggeredFrom: "drag_and_drop",
          });
        }

        return moveCollectionItemAndTrack({
          item,
          move: () => setCollection(item, collection),
          triggeredFrom: "drag_and_drop",
        });
      }),
    );
    return true;
  }

  if (pinIndex !== undefined) {
    const pinnableItems = items.filter(isPinnable);
    if (pinnableItems.length !== items.length) {
      return false;
    }

    const pinned = pinIndex !== null;
    const pinValue = pinIndex ?? false;
    await Promise.all(
      pinnableItems.map(async (item) => {
        if (isItemPinned(item) === pinned) {
          await setPinned(item, pinValue);
          return;
        }

        await setCollectionItemPinnedAndTrack({
          item,
          pinned,
          triggeredFrom: "drag_and_drop",
          setPinned: () => setPinned(item, pinValue),
        });
      }),
    );
  }

  return true;
}
