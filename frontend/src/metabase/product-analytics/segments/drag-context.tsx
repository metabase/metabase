import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  type UniqueIdentifier,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import {
  type MutableRefObject,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { useDndSensors } from "metabase/common/hooks";
import { getPortalRootElement } from "metabase/common/utils/portal";
import GrabberS from "metabase/css/components/grabber.module.css";
import { Group, Icon, Text } from "metabase/ui";

import type { EventDefinition } from "../events/types";

import type { PaletteSegment } from "./types";

/** What's in the air: a palette segment, or an event dragged out of the setup panel. */
export type DragItem =
  | { kind: "segment"; segment: PaletteSegment }
  | { kind: "event"; event: EventDefinition };

/** The item being dragged, and the id of the element it was picked up from. */
export type ActiveDrag = { id: UniqueIdentifier; item: DragItem };

/**
 * Where a drag can land. "pointer" targets take the drop only while the
 * pointer is over them; "closest" ones (rows of a sortable list) take any
 * drop that no pointer target does, whichever is nearest.
 */
export type DropTarget = {
  accepts: (drag: ActiveDrag) => boolean;
  onDrop: (drag: ActiveDrag, overId: UniqueIdentifier) => void;
  collision?: "pointer" | "closest";
};

/** Read when a drag starts or ends, so entries return their latest value. */
type Registry<T> = Map<UniqueIdentifier, () => T | undefined>;

type DragRegistries = {
  items: Registry<DragItem>;
  targets: Registry<DropTarget>;
};

type SegmentDragState = {
  /** Whether the palette is showing, so slots can say to drag from it. */
  isPaletteOpen: boolean;
  dragging: ActiveDrag | null;
  registries: DragRegistries;
};

const SegmentDragContext = createContext<SegmentDragState>({
  isPaletteOpen: false,
  dragging: null,
  registries: { items: new Map(), targets: new Map() },
});

const DRAG_DISTANCE = 4;

const getDrag = (
  registries: DragRegistries,
  id: UniqueIdentifier,
): ActiveDrag | null => {
  const item = registries.items.get(id)?.();
  return item !== undefined ? { id, item } : null;
};

type SegmentDragProviderProps = {
  isPaletteOpen: boolean;
  children: ReactNode;
};

/**
 * Drag and drop between the palette and the setup panel, and reordering of
 * event lists. Pointer-based (dnd-kit) rather than the browser's native drag
 * and drop, so drags crossing the document editor stay out of its own drop
 * handling.
 */
export const SegmentDragProvider = ({
  isPaletteOpen,
  children,
}: SegmentDragProviderProps) => {
  const [registries] = useState<DragRegistries>(() => ({
    items: new Map(),
    targets: new Map(),
  }));
  const [dragging, setDragging] = useState<ActiveDrag | null>(null);
  const sensors = useDndSensors({ distance: DRAG_DISTANCE });

  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const drag = getDrag(registries, args.active.id);
      const eligible = (collision: DropTarget["collision"]) =>
        args.droppableContainers.filter((container) => {
          const target = registries.targets.get(container.id)?.();
          return (
            drag !== null &&
            target !== undefined &&
            (target.collision ?? "pointer") === collision &&
            target.accepts(drag)
          );
        });
      const hits = pointerWithin({
        ...args,
        droppableContainers: eligible("pointer"),
      });
      return hits.length > 0
        ? hits
        : closestCenter({ ...args, droppableContainers: eligible("closest") });
    },
    [registries],
  );

  const handleDragStart = ({ active }: DragStartEvent) => {
    document.body.classList.add(GrabberS.grabbing);
    setDragging(getDrag(registries, active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    document.body.classList.remove(GrabberS.grabbing);
    setDragging(null);
    const drag = getDrag(registries, active.id);
    const target =
      over !== null ? registries.targets.get(over.id)?.() : undefined;
    if (drag !== null && over !== null && target?.accepts(drag)) {
      target.onDrop(drag, over.id);
    }
  };

  const handleDragCancel = () => {
    document.body.classList.remove(GrabberS.grabbing);
    setDragging(null);
  };

  const value = useMemo(
    () => ({ isPaletteOpen, dragging, registries }),
    [isPaletteOpen, dragging, registries],
  );

  return (
    <SegmentDragContext.Provider value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}
        {/* Portalled so the preview isn't offset inside scrolled panels. */}
        {createPortal(
          <DragOverlay dropAnimation={null}>
            {dragging !== null && <DragPreview item={dragging.item} />}
          </DragOverlay>,
          getPortalRootElement(),
        )}
      </DndContext>
    </SegmentDragContext.Provider>
  );
};

export const useSegmentDrag = () => {
  const { isPaletteOpen } = useContext(SegmentDragContext);
  return { isPaletteOpen };
};

const DragPreview = ({ item }: { item: DragItem }) => (
  <Group
    gap="xs"
    wrap="nowrap"
    px="sm"
    py="xs"
    bdrs="sm"
    bg="background-primary"
    bd="1px solid var(--mb-color-border-brand)"
    maw={280}
    style={{ boxShadow: "0 2px 8px var(--mb-color-shadow)" }}
  >
    <Icon name={item.kind === "segment" ? "segment" : "grabber"} size={12} />
    <Text truncate>
      {item.kind === "segment" ? item.segment.name : item.event.name}
    </Text>
  </Group>
);

const useLatestRef = <T,>(value: T): MutableRefObject<T> => {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
};

/** Keeps `get` in the registry under `id` while mounted. */
const useRegistryEntry = <T,>(
  registry: Registry<T>,
  id: UniqueIdentifier,
  value: T | undefined,
) => {
  const ref = useLatestRef(value);
  useLayoutEffect(() => {
    const get = () => ref.current;
    registry.set(id, get);
    return () => {
      registry.delete(id);
    };
  }, [registry, id, ref]);
};

/** Lets the elements with these ids (e.g. sortable rows) be picked up as these items. */
export const useDragItems = (entries: ReadonlyArray<[string, DragItem]>) => {
  const { registries } = useContext(SegmentDragContext);
  const ref = useLatestRef(entries);
  const idsKey = entries.map(([id]) => id).join("\n");
  useLayoutEffect(() => {
    const ids = idsKey.split("\n");
    ids.forEach((id) =>
      registries.items.set(
        id,
        () => ref.current.find(([other]) => other === id)?.[1],
      ),
    );
    return () => ids.forEach((id) => registries.items.delete(id));
  }, [registries, idsKey, ref]);
};

/** Makes an element draggable as `item`. Nothing drags while it's undefined. */
export const useDragSource = (item: DragItem | undefined) => {
  const id = useId();
  const { registries } = useContext(SegmentDragContext);
  useRegistryEntry(registries.items, id, item);
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id,
    disabled: item === undefined,
  });
  return {
    isDragging,
    dragRef: setNodeRef,
    dragListeners: item !== undefined ? listeners : undefined,
  };
};

/**
 * Registers a drop target for the element with `id`, e.g. the rows of a
 * sortable list, whose droppables `useSortable` already creates.
 */
export const useDropTargetRegistration = (
  id: UniqueIdentifier,
  target: DropTarget,
) => {
  const { registries } = useContext(SegmentDragContext);
  useRegistryEntry(registries.targets, id, target);
};

/**
 * Makes an element a drop target. Spread `dropProps` on it. `isActive` while
 * something it accepts is being dragged anywhere, `isOver` while it's over it.
 */
export const useDropTarget = (target: DropTarget) => {
  const id = useId();
  const { dragging, registries } = useContext(SegmentDragContext);
  useRegistryEntry(registries.targets, id, target);
  const isActive = dragging !== null && target.accepts(dragging);
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !isActive });
  return {
    isActive,
    isOver: isActive && isOver,
    dropProps: {
      ref: setNodeRef,
      "data-drop-active": isActive,
      "data-drop-over": isActive && isOver,
    },
  };
};

type SegmentDropTargetOptions = {
  accepts: (segment: PaletteSegment) => boolean;
  onDrop: (segment: PaletteSegment) => void;
};

/** A drop target for palette segments. */
export const useSegmentDropTarget = ({
  accepts,
  onDrop,
}: SegmentDropTargetOptions) =>
  useDropTarget({
    accepts: ({ item }) => item.kind === "segment" && accepts(item.segment),
    onDrop: ({ item }) => {
      if (item.kind === "segment") {
        onDrop(item.segment);
      }
    },
  });

type EventDropTargetOptions = {
  onDrop: (event: EventDefinition) => void;
  isDisabled?: boolean;
};

/** A drop target for events dragged out of the setup panel. */
export const useEventDropTarget = ({
  onDrop,
  isDisabled = false,
}: EventDropTargetOptions) =>
  useDropTarget({
    accepts: ({ item }) => !isDisabled && item.kind === "event",
    onDrop: ({ item }) => {
      if (item.kind === "event") {
        onDrop(item.event);
      }
    },
  });
