import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useState } from "react";

import type { IconName } from "metabase/ui";

type ContainerId = "left" | "right";

/**
 * External drag overlay allows us to provide visual feedback when dragging
 * pills between 2 ReorderableTagsInput components by drawing an overlay layer
 * rendering pills.
 */
export function useExternalDragOverlay({
  leftValues,
  rightValues,
  onConfigurationChange,
  maxLeftColumns,
  maxRightColumns,
}: {
  leftValues: string[];
  rightValues: string[];
  onConfigurationChange: (values: {
    left: string[];
    right: string[];
    entityIcon?: IconName | null;
  }) => void;
  maxLeftColumns: number;
  maxRightColumns: number;
}) {
  const [activePillId, setActivePillId] = useState<string | null>(null);
  const [currentDroppableContainer, setCurrentDroppableContainer] = useState<
    string | null
  >(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActivePillId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    const containerId = over?.data?.current?.containerId;
    if (!containerId) {
      return;
    }
    // Storing the id of container under dragged element
    // to hide it in original container when dragging between the two.
    setCurrentDroppableContainer(containerId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActivePillId(null);
    setCurrentDroppableContainer(null);
    const { active, over } = event;

    if (!over) {
      return;
    }

    const activeId = String(active.id);
    const from = active.data?.current?.containerId as ContainerId | undefined;

    if (!from) {
      return;
    }

    // Determine target container - could be from over item's containerId or over.id itself
    let to: ContainerId | undefined;
    let overIndexInTo = -1;

    // Check if we're dropping on an item (has containerId)
    if (over.data?.current?.containerId) {
      to = over.data.current.containerId as ContainerId;
      const toList = to === "left" ? leftValues : rightValues;
      overIndexInTo = toList.indexOf(String(over.id));
    }
    // Check if we're dropping on a container itself (droppable area)
    else if (over.id === "left" || over.id === "right") {
      to = over.id as ContainerId;
      overIndexInTo = -1; // Append to end when dropping on container
    }

    if (!to) {
      return;
    }

    const fromList = from === "left" ? leftValues : rightValues;

    const fromIndex = fromList.indexOf(activeId);
    if (fromIndex === -1) {
      return;
    }

    // Same container: reorder
    if (from === to) {
      if (overIndexInTo === -1 || fromIndex === overIndexInTo) {
        return;
      }
      const next = arrayMove(fromList, fromIndex, overIndexInTo);
      if (from === "left") {
        onConfigurationChange({
          left: next,
          right: rightValues,
        });
      } else {
        onConfigurationChange({
          left: leftValues,
          right: next,
        });
      }
      return;
    }

    // Moving items between containers
    const maxForTo = to === "left" ? maxLeftColumns : maxRightColumns;
    const toCurrent = to === "left" ? leftValues : rightValues;
    if (toCurrent.length >= maxForTo) {
      return;
    }

    const nextFrom = fromList.slice() as string[];
    nextFrom.splice(fromIndex, 1);

    const nextTo = toCurrent.slice() as string[];
    const insertIndex = overIndexInTo === -1 ? nextTo.length : overIndexInTo;
    nextTo.splice(insertIndex, 0, activeId);

    if (to === "left") {
      onConfigurationChange({
        left: nextTo,
        right: nextFrom,
      });
    } else {
      onConfigurationChange({
        left: nextFrom,
        right: nextTo,
      });
    }
  };

  return {
    activeId: activePillId,
    currentDroppable: currentDroppableContainer,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  };
}
