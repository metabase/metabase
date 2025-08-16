import {
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ObjectViewSectionSettings } from "metabase-types/api";

import {
  type DraggableKey,
  isFieldDraggableKey,
  isSectionDraggableKey,
  parseDraggableKey,
} from "./utils";
import { getFieldsLimit } from "../TableDetailView/use-detail-view-sections";

type UseSectionsDragNDropProps = {
  updateSection: (
    id: number,
    update: Partial<ObjectViewSectionSettings>,
  ) => void;
  updateSections: (sections: ObjectViewSectionSettings[]) => void;
  sections: ObjectViewSectionSettings[];
};

export function useSectionsDragNDrop({
  sections,
  updateSection,
  updateSections,
}: UseSectionsDragNDropProps) {
  const [clonedItems, setClonedItems] = useState<
    ObjectViewSectionSettings[] | null
  >(null);

  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMovedToNewContainer = useRef(false);

  const findSection = useCallback(
    (key: DraggableKey | null) => {
      if (key?.type === "section") {
        return sections.find((section) => section.id === key.id);
      }

      if (key?.type === "field") {
        return sections.find((section) =>
          section.fields.some((field) => field.field_id === key.id),
        );
      }

      return null;
    },
    [sections],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveId(event.active.id);
      setClonedItems(sections);
    },
    [sections],
  );

  const handleDragCancel = useCallback(() => {
    if (clonedItems) {
      // Reset items to their original state in case items have been
      // Dragged across containers
      updateSections(clonedItems);
    }

    setActiveId(null);
    setClonedItems(null);
  }, [clonedItems, updateSections]);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (event.over?.id === event.active.id) {
        return;
      }

      const overId = parseDraggableKey(event.over?.id as string);
      const activeId = parseDraggableKey(event.active.id as string);

      if (overId == null || activeId?.type === "section") {
        return;
      }

      const overContainer = findSection(overId);
      const activeContainer = findSection(activeId);

      if (!overContainer || !activeContainer) {
        return;
      }

      if (activeContainer !== overContainer) {
        const activeItems = activeContainer.fields;
        const overItems = overContainer.fields;
        const fieldsLimit = getFieldsLimit(overContainer);

        if (fieldsLimit && overItems.length >= fieldsLimit) {
          return;
        }

        let newIndex: number;
        const activeIndex =
          activeId?.type === "field"
            ? activeItems.findIndex((item) => item.field_id === activeId.id)
            : -1;

        if (overId.type === "section") {
          newIndex = overItems.length + 1;
        } else {
          const overIndex =
            overId.type === "field"
              ? overItems.findIndex((item) => item.field_id === overId.id)
              : -1;

          const isBelowOverItem =
            event.over &&
            event.active.rect.current.translated &&
            event.active.rect.current.translated.top >
              event.over.rect.top + event.over.rect.height;

          const modifier = isBelowOverItem ? 1 : 0;

          newIndex =
            overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
        }

        recentlyMovedToNewContainer.current = true;

        updateSection(activeContainer.id, {
          fields: activeItems.filter((item) => item.field_id !== activeId?.id),
        });

        updateSection(overContainer.id, {
          fields: [
            ...overItems.slice(0, newIndex),
            activeItems[activeIndex],
            ...overItems.slice(newIndex, overItems.length),
          ],
        });
      }
    },
    [updateSection, findSection],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeId = parseDraggableKey(event.active?.id as string);
      const overId = parseDraggableKey(event.over?.id as string);

      if (activeId?.type === "section" && overId?.type === "section") {
        const activeIndex = sections.findIndex(
          (section) => section.id === activeId.id,
        );
        const overIndex = sections.findIndex(
          (section) => section.id === overId.id,
        );
        if (overIndex === 0 || overIndex === 1) {
          // don't allow to drag sections before header or subtitle
          return;
        }
        updateSections(arrayMove(sections, activeIndex, overIndex));
      }

      const activeContainer = findSection(activeId);

      if (!activeContainer) {
        setActiveId(null);
        return;
      }

      if (overId == null) {
        setActiveId(null);
        return;
      }

      const overContainer = findSection(overId);

      if (overContainer) {
        const activeIndex = activeContainer.fields.findIndex(
          (field) => field.field_id === activeId?.id,
        );
        const overIndex = overContainer.fields.findIndex(
          (field) => field.field_id === overId.id,
        );

        if (activeIndex !== overIndex) {
          updateSection(overContainer.id, {
            fields: arrayMove(overContainer.fields, activeIndex, overIndex),
          });
        }
      }

      setActiveId(null);
      setClonedItems(null);
    },
    [findSection, sections, updateSection, updateSections],
  );

  const collisionDetectionStrategy: CollisionDetection = useCallback(
    (args) => {
      const activeKey = parseDraggableKey(activeId);

      // Collisions between sections
      if (activeKey?.type === "section") {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((container) =>
            isSectionDraggableKey(container.id),
          ),
        });
      }

      // Start by finding any intersecting droppable
      const pointerIntersections = pointerWithin(args);
      const intersections =
        pointerIntersections.length > 0
          ? // If there are droppables intersecting with the pointer, return those
            pointerIntersections
          : rectIntersection(args);
      let overId = getFirstCollision(intersections, "id");

      if (overId != null) {
        const overKey = parseDraggableKey(overId);
        const isOverSection = overKey?.type === "section";
        if (isOverSection) {
          const overSectionFields = sections.find(
            (section) => section.id === overKey.id,
          )?.fields;

          // If a container is matched and it contains items (columns 'A', 'B', 'C')
          if (overSectionFields && overSectionFields.length > 0) {
            // Return the closest droppable within that container
            overId = closestCenter({
              ...args,
              droppableContainers: args.droppableContainers.filter(
                (container) =>
                  isFieldDraggableKey(container.id) &&
                  overSectionFields.some(
                    (field) =>
                      field.field_id === parseDraggableKey(container.id)?.id,
                  ),
              ),
            })[0]?.id;
          }
        }

        lastOverId.current = overId;
        return [{ id: overId }];
      }

      // When a draggable item moves to a new container, the layout may shift
      // and the `overId` may become `null`. We manually set the cached `lastOverId`
      // to the id of the draggable item that was moved to the new container, otherwise
      // the previous `overId` will be returned which can cause items to incorrectly shift positions
      if (recentlyMovedToNewContainer.current) {
        lastOverId.current = activeId;
      }

      // If no droppable is matched, return the last match
      return lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    [activeId, sections],
  );

  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  }, [sections]);

  return {
    activeId,
    setActiveId,
    lastOverId,
    recentlyMovedToNewContainer,
    collisionDetectionStrategy,
    handleDragStart,
    handleDragOver,
    handleDragCancel,
    handleDragEnd,
  };
}
