import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  type DropAnimation,
  type MeasuringConfiguration,
  MeasuringStrategy,
  PointerSensor,
  type UniqueIdentifier,
  closestCenter,
  defaultDropAnimation,
  defaultDropAnimationSideEffects,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useDndContext,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS, isKeyboardEvent } from "@dnd-kit/utilities";
import classNames from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type {
  DataAppWidget,
  DataAppWidgetSection,
  WidgetId,
} from "metabase-enterprise/data-apps/types";

import {
  CanvasWidgetWrapper,
  type CanvasWidgetWrapperProps,
  Position,
} from "./CanvasWidgetWrapper";
import styles from "./DndCanvas.module.css";

const measuring: MeasuringConfiguration = {
  droppable: {
    strategy: MeasuringStrategy.Always,
  },
};

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: "0.5",
      },
    },
  }),
};

interface Props {
  components: DataAppWidget[];
  onComponentsUpdate: (newComponents: DataAppWidget[]) => void;
  renderCanvasComponent: (id: WidgetId) => React.ReactNode;
}

export const DndCanvas = ({
  components,
  onComponentsUpdate,
  renderCanvasComponent,
}: Props) => {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [clonedItems, setClonedItems] = useState<DataAppWidget[] | null>(null);
  const sensors = useSensors(useSensor(PointerSensor));

  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMovedToNewContainer = useRef(false);

  const componentsMap = useMemo(() => {
    const map = new Map<WidgetId, DataAppWidget>();
    components.forEach((item) => map.set(item.id, item));
    return map;
  }, [components]);

  const collisionDetectionStrategy: CollisionDetection = useCallback(
    (args) => {
      // console.log("collisionDetectionStrategy", args);

      const activeWidget = componentsMap.get(activeId as WidgetId);

      if (activeId && activeWidget && activeWidget.type === "section") {
        console.log("collisionDetectionStrategy - CASE 1");
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((container) => {
            return (
              componentsMap.get(container.id as WidgetId)?.type === "section"
            );
          }),
        });
      }

      // Start by finding any intersecting droppable
      const pointerIntersections = pointerWithin(args);

      console.log(pointerIntersections);

      const intersections =
        pointerIntersections.length > 0
          ? // If there are droppables intersecting with the pointer, return those
            pointerIntersections
          : rectIntersection(args);
      let overId = getFirstCollision(intersections, "id");

      if (overId != null) {
        const overWidget = componentsMap.get(overId as WidgetId);
        if (overWidget && overWidget.type === "section") {
          const containerItems = overWidget.childrenIds;

          // If a container is matched and it contains items (columns 'A', 'B', 'C')
          if (containerItems.length > 0) {
            // Return the closest droppable within that container
            overId = closestCenter({
              ...args,
              droppableContainers: args.droppableContainers.filter(
                (container) =>
                  container.id !== overId &&
                  containerItems.includes(container.id),
              ),
            })[0]?.id;
          }
        }

        lastOverId.current = overId;

        console.log("collisionDetectionStrategy - CASE 2");
        return [{ id: overId }];
      }

      // When a draggable item moves to a new container, the layout may shift
      // and the `overId` may become `null`. We manually set the cached `lastOverId`
      // to the id of the draggable item that was moved to the new container, otherwise
      // the previous `overId` will be returned which can cause items to incorrectly shift positions
      if (recentlyMovedToNewContainer.current) {
        lastOverId.current = activeId;
      }

      console.log("collisionDetectionStrategy - CASE 3");
      // If no droppable is matched, return the last match
      return lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    [activeId, componentsMap],
  );

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id);
    setClonedItems(components);
  }

  function handleDragCancel() {
    console.log("onDragCancel");

    if (clonedItems) {
      // Reset items to their original state in case items have been
      // Dragged across containers
      onComponentsUpdate(clonedItems);
    }

    setActiveId(null);
    setClonedItems(null);
  }

  const findContainer = (id: UniqueIdentifier) => {
    const parent = components.find((item) =>
      item.childrenIds?.includes(id as WidgetId),
    ); // TODO: optimize complexity

    return parent?.id || "root";
  };

  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  }, [components]);

  return (
    <DndContext
      collisionDetection={collisionDetectionStrategy}
      onDragStart={handleDragStart}
      // onDragMove={handleDragMove}
      onDragOver={({ active, over }) => {
        console.log("onDragOver", { active, over });

        const overId = over?.id;

        if (overId == null /*|| active.id in items*/) {
          return;
        }

        const overContainerId = findContainer(overId);
        const activeContainerId = findContainer(active.id);

        if (!overContainerId || !activeContainerId) {
          return;
        }

        if (activeContainerId !== overContainerId) {
          const newItems = components.map((item) => {
            if (active.id === item.id) {
              return {
                ...item,
                parentId: overContainerId,
              };
            }

            return item;
          });

          recentlyMovedToNewContainer.current = true;

          onComponentsUpdate(newItems);
        }
      }}
      onDragEnd={({ active, over }) => {
        // const activeWidget = componentsMap.get(active.id as WidgetId);
        //
        // if (activeWidget && activeWidget.type === "section" && over?.id) {
        //   setContainers((containers) => {
        //     const activeIndex = containers.indexOf(active.id);
        //     const overIndex = containers.indexOf(over.id);
        //
        //     return arrayMove(containers, activeIndex, overIndex);
        //   });
        // }

        const activeContainerId = findContainer(active.id);

        if (!activeContainerId) {
          setActiveId(null);
          return;
        }

        const overId = over?.id;

        if (overId == null) {
          setActiveId(null);
          return;
        }

        // if (overId === PLACEHOLDER_ID) {
        //   const newContainerId = getNextContainerId();
        //
        //   unstable_batchedUpdates(() => {
        //     setContainers((containers) => [...containers, newContainerId]);
        //     setItems((items) => ({
        //       ...items,
        //       [activeContainer]: items[activeContainer].filter(
        //         (id) => id !== activeId
        //       ),
        //       [newContainerId]: [active.id],
        //     }));
        //     setActiveId(null);
        //   });
        //   return;
        // }

        const overContainerId = findContainer(overId);

        if (overContainerId) {
          const activeIndex = (
            componentsMap.get(activeContainerId) as DataAppWidgetSection
          ).childrenIds.indexOf(active.id);
          const overIndex = (
            componentsMap.get(overContainerId) as DataAppWidgetSection
          ).childrenIds.indexOf(overId);

          if (activeIndex !== overIndex) {
            // TODO: respect the insert position index
            const newComponents = [
              ...components.map((component) => {
                if (component.id === activeContainerId) {
                  component.childrenIds = component.childrenIds.filter(
                    (id) => id !== active.id,
                  );
                }

                if (component.id === overContainerId) {
                  component.childrenIds = [
                    ...component.childrenIds.slice(0, overIndex),
                    active.id,
                    ...component.childrenIds.slice(
                      overIndex,
                      component.childrenIds?.length,
                    ),
                  ];
                }

                return component;
              }),
            ];

            onComponentsUpdate(newComponents);
          }
        }

        setActiveId(null);
      }}
      onDragCancel={handleDragCancel}
      sensors={sensors}
      // collisionDetection={closestCenter}
      measuring={measuring}
    >
      {renderCanvasComponent("root")}
    </DndContext>
  );
};

function PageOverlay({
  id,
  components,
  ...props
}: Omit<CanvasWidgetWrapperProps, "index"> & {
  components: { id: UniqueIdentifier }[];
}) {
  const { activatorEvent, over } = useDndContext();
  const isKeyboardSorting = isKeyboardEvent(activatorEvent);
  const activeIndex = components.findIndex((it) => it.id === id);
  const overIndex = over?.id
    ? components.findIndex(({ id }) => id === over?.id)
    : -1;

  const component = components.find(
    ({ id: componentId }) => componentId === id,
  );

  return (
    <CanvasWidgetWrapper
      id={id}
      component={component}
      {...props}
      clone
      insertPosition={
        isKeyboardSorting && overIndex !== activeIndex
          ? overIndex > activeIndex
            ? Position.After
            : Position.Before
          : undefined
      }
    />
  );
}

function SortablePage({
  id,
  activeIndex,
  ...props
}: CanvasWidgetWrapperProps & { activeIndex: number }) {
  const {
    attributes,
    listeners,
    index,
    isDragging,
    isSorting,
    over,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id,
    animateLayoutChanges: always,
  });

  return (
    <CanvasWidgetWrapper
      ref={setNodeRef}
      id={id}
      active={isDragging}
      style={{
        transition,
        transform: isSorting ? undefined : CSS.Translate.toString(transform),
      }}
      insertPosition={
        over?.id === id
          ? index > activeIndex
            ? Position.After
            : Position.Before
          : undefined
      }
      {...props}
      {...attributes}
      {...listeners}
    />
  );
}

function always() {
  return true;
}
