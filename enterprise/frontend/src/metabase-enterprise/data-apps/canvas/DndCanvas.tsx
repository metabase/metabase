import type {
  DragEndEvent,
  DragStartEvent,
  DropAnimation,
  MeasuringConfiguration,
  UniqueIdentifier,
} from "@dnd-kit/core";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  useDndContext,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS, isKeyboardEvent } from "@dnd-kit/utilities";
import classNames from "classnames";
import { useState } from "react";

import type { DataAppWidget } from "metabase-enterprise/data-apps/types";

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
  keyframes({ transform }) {
    return [
      { transform: CSS.Transform.toString(transform.initial) },
      {
        transform: CSS.Transform.toString({
          scaleX: 0.98,
          scaleY: 0.98,
          x: transform.final.x - 10,
          y: transform.final.y - 10,
        }),
      },
    ];
  },
  sideEffects: defaultDropAnimationSideEffects({
    className: {
      active: styles.active,
    },
  }),
};

interface Props {
  components: DataAppWidget[];
  onComponentsUpdate: (newComponents: DataAppWidget[]) => void;

  onComponentRender: (component: DataAppWidget) => React.ReactNode;
}

export const DndCanvas = ({
  components,
  onComponentsUpdate,
  onComponentRender,
}: Props) => {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const activeIndex =
    activeId != null ? components.findIndex(({ id }) => id === activeId) : -1;
  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id);
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  function handleDragEnd({ over }: DragEndEvent) {
    if (over) {
      const overIndex = components.findIndex(({ id }) => id === over.id);

      if (activeIndex !== overIndex) {
        onComponentsUpdate(arrayMove(components, activeIndex, overIndex));
      }
    }

    setActiveId(null);
  }

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={measuring}
    >
      <SortableContext items={components}>
        <ul className={classNames(styles.Pages, styles.grid)}>
          {components.map((component, index) => (
            <SortablePage
              id={component.id}
              index={index + 1}
              component={component}
              key={component.id}
              activeIndex={activeIndex}
              onRemove={() =>
                onComponentsUpdate(
                  components.filter(({ id }) => id !== component.id),
                )
              }
              onComponentRender={onComponentRender}
            />
          ))}
        </ul>
      </SortableContext>
      <DragOverlay dropAnimation={dropAnimation}>
        {activeId != null ? (
          <PageOverlay id={activeId} components={components} />
        ) : null}
      </DragOverlay>
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
