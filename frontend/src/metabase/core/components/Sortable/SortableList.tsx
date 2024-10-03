import type {
  DragOverEvent,
  DragStartEvent,
  Modifier,
  SensorDescriptor,
} from "@dnd-kit/core";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { SortableContext, arrayMove } from "@dnd-kit/sortable";
import { useEffect, useMemo, useState } from "react";
import _ from "underscore";

import GrabberS from "metabase/css/components/grabber.module.css";
import { isNotNull } from "metabase/lib/types";

type ItemId = number | string;
export type DragEndEvent = {
  id: ItemId;
  newIndex: number;
  itemIds: ItemId[];
};

export type RenderItemProps<T> = {
  item: T;
  id: ItemId;
  isDragOverlay?: boolean;
};
type SortableListProps<T> = {
  items: T[];
  getId: (item: T) => ItemId;
  renderItem: ({
    item,
    id,
    isDragOverlay,
  }: RenderItemProps<T>) => JSX.Element | null;
  onSortStart?: (event: DragStartEvent) => void;
  onSortEnd?: ({ id, newIndex }: DragEndEvent) => void;
  sensors?: SensorDescriptor<any>[];
  modifiers?: Modifier[];
  useDragOverlay?: boolean;
};

export const SortableList = <T,>({
  items,
  getId,
  renderItem,
  onSortStart,
  onSortEnd,
  sensors = [],
  modifiers = [],
  useDragOverlay = true,
}: SortableListProps<T>) => {
  const [itemIds, setItemIds] = useState<ItemId[]>([]);
  const [indexedItems, setIndexedItems] = useState<Partial<Record<ItemId, T>>>(
    {},
  );
  const [activeItem, setActiveItem] = useState<T | null>(null);

  useEffect(() => {
    setItemIds(items.map(getId));
    setIndexedItems(_.indexBy(items, getId));
  }, [items, getId]);

  const sortableElements = useMemo(
    () =>
      itemIds
        .map(id => {
          const item = indexedItems[id];
          if (item) {
            return renderItem({ item, id });
          }
        })
        .filter(isNotNull),
    [itemIds, renderItem, indexedItems],
  );

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (over && active.id !== over.id) {
      setItemIds(ids => {
        const oldIndex = ids.indexOf(active.id);
        const newIndex = ids.indexOf(over.id);
        return arrayMove(ids, oldIndex, newIndex);
      });
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    document.body.classList.add(GrabberS.grabbing);

    onSortStart?.(event);

    const item = items.find(item => getId(item) === event.active.id);
    if (item) {
      setActiveItem(item);
    }
  };

  const handleDragEnd = () => {
    document.body.classList.remove(GrabberS.grabbing);
    if (activeItem && onSortEnd) {
      onSortEnd({
        id: getId(activeItem),
        newIndex: itemIds.findIndex(id => id === getId(activeItem)),
        itemIds,
      });
      setActiveItem(null);
    }
  };

  return (
    <DndContext
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      sensors={sensors}
      modifiers={modifiers}
    >
      <SortableContext items={itemIds}>{sortableElements}</SortableContext>
      {useDragOverlay && (
        <DragOverlay>
          {activeItem
            ? renderItem({
                item: activeItem,
                id: getId(activeItem),
                isDragOverlay: true,
              })
            : null}
        </DragOverlay>
      )}
    </DndContext>
  );
};
