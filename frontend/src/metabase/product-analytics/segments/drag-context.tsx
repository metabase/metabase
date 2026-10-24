import type { DragEvent, ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { EventDefinition } from "../events/types";

import type { PaletteSegment } from "./types";

/** What's in the air: a palette segment, or an event dragged out of the setup panel. */
export type DragItem =
  | { kind: "segment"; segment: PaletteSegment }
  | { kind: "event"; event: EventDefinition };

type SegmentDragState = {
  /** Whether the palette is showing, so slots can say to drag from it. */
  isPaletteOpen: boolean;
  /** Shows the palette if it's hidden, and hides it if it's showing. */
  onTogglePalette: () => void;
  dragging: DragItem | null;
  /** The palette item under the pointer, so targets can hint before a drag. */
  hovering: PaletteSegment | null;
  startDrag: (segment: PaletteSegment, event: DragEvent<HTMLElement>) => void;
  startEventDrag: (
    definition: EventDefinition,
    event: DragEvent<HTMLElement>,
  ) => void;
  endDrag: () => void;
  setHovering: (segment: PaletteSegment | null) => void;
  /** Uses a people segment as a filter, from a drop or a click. */
  onPeopleSegment: (segment: PaletteSegment) => void;
};

const SegmentDragContext = createContext<SegmentDragState>({
  isPaletteOpen: false,
  onTogglePalette: () => undefined,
  dragging: null,
  hovering: null,
  startDrag: () => undefined,
  startEventDrag: () => undefined,
  endDrag: () => undefined,
  setHovering: () => undefined,
  onPeopleSegment: () => undefined,
});

const DATA_TYPE = "application/x-metabase-segment";

type SegmentDragProviderProps = {
  isPaletteOpen: boolean;
  onTogglePalette: () => void;
  onPeopleSegment: (segment: PaletteSegment) => void;
  children: ReactNode;
};

/**
 * Tracks what's being dragged between the palette and the setup panel, using
 * the browser's own drag and drop. The item lives here rather than in the
 * drag data, so drop targets can light up while it's still in the air.
 */
export const SegmentDragProvider = ({
  isPaletteOpen,
  onTogglePalette,
  onPeopleSegment,
  children,
}: SegmentDragProviderProps) => {
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [hovering, setHovering] = useState<PaletteSegment | null>(null);

  const begin = useCallback(
    (item: DragItem, key: string, event: DragEvent<HTMLElement>) => {
      // Firefox only starts a drag that carries data.
      event.dataTransfer.setData(DATA_TYPE, key);
      event.dataTransfer.effectAllowed = "copy";
      setDragging(item);
    },
    [],
  );
  const startDrag = useCallback(
    (segment: PaletteSegment, event: DragEvent<HTMLElement>) =>
      begin({ kind: "segment", segment }, segment.key, event),
    [begin],
  );
  const startEventDrag = useCallback(
    (definition: EventDefinition, event: DragEvent<HTMLElement>) =>
      begin({ kind: "event", event: definition }, definition.name, event),
    [begin],
  );
  const endDrag = useCallback(() => setDragging(null), []);

  const value = useMemo(
    () => ({
      isPaletteOpen,
      onTogglePalette,
      dragging,
      hovering,
      startDrag,
      startEventDrag,
      endDrag,
      setHovering,
      onPeopleSegment,
    }),
    [
      isPaletteOpen,
      onTogglePalette,
      dragging,
      hovering,
      startDrag,
      startEventDrag,
      endDrag,
      onPeopleSegment,
    ],
  );

  return (
    <SegmentDragContext.Provider value={value}>
      {children}
    </SegmentDragContext.Provider>
  );
};

export const useSegmentDrag = () => useContext(SegmentDragContext);

/**
 * The drag and drop handlers for a target, active while `isActive`. Spread
 * `dropProps` on the element. `isOver` while the item is over it.
 */
const useDropHandlers = (isActive: boolean, onDrop: () => void) => {
  const { endDrag } = useSegmentDrag();
  const [isOver, setIsOver] = useState(false);
  // Enter and leave fire for every child the pointer crosses.
  const enterCountRef = useRef(0);

  useEffect(() => {
    if (!isActive) {
      enterCountRef.current = 0;
      setIsOver(false);
    }
  }, [isActive]);

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!isActive) {
      return;
    }
    event.preventDefault();
    enterCountRef.current += 1;
    setIsOver(true);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!isActive) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = () => {
    if (!isActive) {
      return;
    }
    enterCountRef.current = Math.max(0, enterCountRef.current - 1);
    if (enterCountRef.current === 0) {
      setIsOver(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!isActive) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    enterCountRef.current = 0;
    setIsOver(false);
    onDrop();
    endDrag();
  };

  return {
    isActive,
    isOver: isActive && isOver,
    dropProps: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
      "data-drop-active": isActive,
      "data-drop-over": isActive && isOver,
    },
  };
};

type SegmentDropTargetOptions = {
  accepts: (segment: PaletteSegment) => boolean;
  onDrop: (segment: PaletteSegment) => void;
};

/**
 * Makes an element a drop target for palette segments. `isActive` while a
 * segment it accepts is being dragged anywhere.
 */
export const useSegmentDropTarget = ({
  accepts,
  onDrop,
}: SegmentDropTargetOptions) => {
  const { dragging } = useSegmentDrag();
  const segment =
    dragging?.kind === "segment" && accepts(dragging.segment)
      ? dragging.segment
      : null;
  return useDropHandlers(segment !== null, () => {
    if (segment !== null) {
      onDrop(segment);
    }
  });
};

type EventDropTargetOptions = {
  onDrop: (event: EventDefinition) => void;
};

/** Makes an element a drop target for events dragged out of the setup panel. */
export const useEventDropTarget = ({ onDrop }: EventDropTargetOptions) => {
  const { dragging } = useSegmentDrag();
  const event = dragging?.kind === "event" ? dragging.event : null;
  return useDropHandlers(event !== null, () => {
    if (event !== null) {
      onDrop(event);
    }
  });
};
