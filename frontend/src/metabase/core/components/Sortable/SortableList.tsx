import type {
  DragOverEvent,
  DragStartEvent,
  Modifier,
  SensorDescriptor,
} from "@dnd-kit/core";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { SortableContext, arrayMove } from "@dnd-kit/sortable";
import { useState, useMemo, useEffect } from "react";
import _ from "underscore";

import { isNotNull } from "metabase/lib/types";

type ItemId = number | string;

interface RenderItemProps<T> {
  item: T;
  id: ItemId;
  isDragOverlay?: boolean;
}
interface useSortableListProps<T> {
  items: T[];
  getId: (item: T) => ItemId;
  renderItem: ({ item, id, isDragOverlay }: RenderItemProps<T>) => JSX.Element;
  onSortStart?: (event: DragStartEvent) => void;
  onSortEnd?: ({ id, newIndex }: { id: ItemId; newIndex: number }) => void;
  sensors?: SensorDescriptor<any>[];
  modifiers?: Modifier[];
}

export const SortableList = <T,>({
  items,
  getId,
  renderItem,
  onSortStart,
  onSortEnd,
  sensors = [],
  modifiers = [],
}: useSortableListProps<T>) => {
  const [itemIds, setItemIds] = useState<ItemId[]>([]);
  const [indexedItems, setIndexedItems] = useState<Record<ItemId, T>>({});
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
    document.body.classList.add("grabbing");

    onSortStart?.(event);

    const item = items.find(item => getId(item) === event.active.id);
    if (item) {
      setActiveItem(item);
    }
  };

  const handleDragEnd = () => {
    document.body.classList.remove("grabbing");
    if (activeItem && onSortEnd) {
      onSortEnd({
        id: getId(activeItem),
        newIndex: itemIds.findIndex(id => id === getId(activeItem)),
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
      <DragOverlay>
        {activeItem
          ? renderItem({
              item: activeItem,
              id: getId(activeItem),
              isDragOverlay: true,
            })
          : null}
      </DragOverlay>
    </DndContext>
  );
};
