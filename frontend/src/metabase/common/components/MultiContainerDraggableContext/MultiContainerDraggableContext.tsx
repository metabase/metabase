import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { type ReactNode, useCallback, useEffect, useState } from "react";

export function findContainer<
  TItemsDictionary extends Record<string, string[]>,
>(id: string | null, items: TItemsDictionary): keyof TItemsDictionary | null {
  if (!id) {
    return null;
  }

  if (id in items) {
    return id ?? null;
  }

  return (
    Object.keys(items).find((key) =>
      items[key as keyof typeof items].includes(id),
    ) ?? null
  );
}

export type MultiContainerDraggableContextShouldUpdateStateData<
  TItemsDictionary extends Record<string, string[]>,
> = {
  activeContainer: keyof TItemsDictionary;
  overContainer: keyof TItemsDictionary;
};

type MultiContainerDraggableContextProps<
  TItemsDictionary extends Record<string, string[]>,
> = {
  children: (data: {
    activeId: string | null;
    items: TItemsDictionary;
  }) => ReactNode;
  value: TItemsDictionary;
  shouldUpdateState?: (
    data: MultiContainerDraggableContextShouldUpdateStateData<TItemsDictionary>,
  ) => boolean;
  onChange: (items: TItemsDictionary) => void;
};

export const MultiContainerDraggableContext = <
  TItemsDictionary extends Record<string, string[]>,
>({
  children,
  value,
  shouldUpdateState,
  onChange,
}: MultiContainerDraggableContextProps<TItemsDictionary>) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 15 },
    }),
  );

  const [items, setItems] = useState(value);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setItems(value);
  }, [value]);

  const handleDragStart = useCallback(
    ({ active }: DragStartEvent) => {
      setActiveId(active.id.toString());
    },
    [setActiveId],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;

      if (!over) {
        return;
      }

      const { rect } = active;

      const activeId = active.id.toString();
      const overId = over.id.toString();

      const activeContainer = findContainer(activeId, items);
      const overContainer = findContainer(overId, items);

      // We need to recalculate only between-container moves to update dragging item visually
      if (
        !activeContainer ||
        !overContainer ||
        activeContainer === overContainer
      ) {
        return;
      }

      const shouldUpdate =
        shouldUpdateState?.({
          activeContainer,
          overContainer,
        }) ?? true;

      if (!shouldUpdate) {
        return;
      }

      setItems((prevItems) => {
        const activeItems = prevItems[activeContainer];
        const overItems = prevItems[overContainer];

        const activeIndex = activeItems.indexOf(activeId);
        const overIndex = overItems.indexOf(overId);

        let newIndex;
        if (overId in prevItems) {
          // We're at the root droppable of a container
          newIndex = overItems.length + 1;
        } else {
          const isBelowLastItem =
            over &&
            overIndex === overItems.length - 1 &&
            (rect.current.translated?.top ?? 0) >
              over.rect.top + over.rect.height;

          const modifier = isBelowLastItem ? 1 : 0;

          newIndex =
            overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
        }

        return {
          ...prevItems,
          [activeContainer]: [
            ...prevItems[activeContainer].filter((item) => item !== active.id),
          ],
          [overContainer]: [
            ...prevItems[overContainer].slice(0, newIndex),
            prevItems[activeContainer][activeIndex],
            ...prevItems[overContainer].slice(
              newIndex,
              prevItems[overContainer].length,
            ),
          ],
        };
      });
    },
    [items, shouldUpdateState],
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over) {
        return;
      }

      const activeId = active.id.toString();
      const overId = over.id.toString();

      const activeContainer = findContainer(activeId, items);
      const overContainer = findContainer(overId, items);

      if (
        !activeContainer ||
        !overContainer ||
        activeContainer !== overContainer
      ) {
        return;
      }

      const shouldUpdate =
        shouldUpdateState?.({
          activeContainer,
          overContainer,
        }) ?? true;

      if (!shouldUpdate) {
        return;
      }

      const activeIndex = items[activeContainer].indexOf(activeId);
      const overIndex = items[overContainer].indexOf(overId);

      const updatedItems = {
        ...items,
        [overContainer]: arrayMove(
          items[overContainer],
          activeIndex,
          overIndex,
        ),
      };

      setItems(updatedItems);
      onChange(updatedItems);

      setActiveId(null);
    },
    [items, onChange, shouldUpdateState],
  );

  const handleDragCancel = useCallback(() => setActiveId(null), [setActiveId]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children({ activeId, items })}
    </DndContext>
  );
};
