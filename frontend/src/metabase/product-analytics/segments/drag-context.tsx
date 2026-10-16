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

import type { PaletteSegment } from "./types";

type SegmentDragState = {
  /** Whether the palette is showing, so slots can say to drag from it. */
  isPaletteOpen: boolean;
  dragging: PaletteSegment | null;
  /** The palette item under the pointer, so targets can hint before a drag. */
  hovering: PaletteSegment | null;
  startDrag: (segment: PaletteSegment, event: DragEvent<HTMLElement>) => void;
  endDrag: () => void;
  setHovering: (segment: PaletteSegment | null) => void;
};

const SegmentDragContext = createContext<SegmentDragState>({
  isPaletteOpen: false,
  dragging: null,
  hovering: null,
  startDrag: () => undefined,
  endDrag: () => undefined,
  setHovering: () => undefined,
});

const DATA_TYPE = "application/x-metabase-segment";

/**
 * Tracks the palette segment being dragged, using the browser's own drag and
 * drop. The segment lives here rather than in the drag data, so drop targets
 * can light up while it's still in the air.
 */
type SegmentDragProviderProps = {
  isPaletteOpen: boolean;
  children: ReactNode;
};

export const SegmentDragProvider = ({
  isPaletteOpen,
  children,
}: SegmentDragProviderProps) => {
  const [dragging, setDragging] = useState<PaletteSegment | null>(null);
  const [hovering, setHovering] = useState<PaletteSegment | null>(null);

  const startDrag = useCallback(
    (segment: PaletteSegment, event: DragEvent<HTMLElement>) => {
      // Firefox only starts a drag that carries data.
      event.dataTransfer.setData(DATA_TYPE, segment.key);
      event.dataTransfer.effectAllowed = "copy";
      setDragging(segment);
    },
    [],
  );
  const endDrag = useCallback(() => setDragging(null), []);

  const value = useMemo(
    () => ({
      isPaletteOpen,
      dragging,
      hovering,
      startDrag,
      endDrag,
      setHovering,
    }),
    [isPaletteOpen, dragging, hovering, startDrag, endDrag],
  );

  return (
    <SegmentDragContext.Provider value={value}>
      {children}
    </SegmentDragContext.Provider>
  );
};

export const useSegmentDrag = () => useContext(SegmentDragContext);

type DropTargetOptions = {
  accepts: (segment: PaletteSegment) => boolean;
  onDrop: (segment: PaletteSegment) => void;
};

/**
 * Makes an element a drop target for palette segments. Spread `dropProps` on
 * it. `isActive` while a segment it accepts is being dragged anywhere,
 * `isOver` while that segment is over it.
 */
export const useSegmentDropTarget = ({
  accepts,
  onDrop,
}: DropTargetOptions) => {
  const { dragging, endDrag } = useSegmentDrag();
  const [isOver, setIsOver] = useState(false);
  // Enter and leave fire for every child the pointer crosses.
  const enterCountRef = useRef(0);
  const isActive = dragging !== null && accepts(dragging);

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
    if (!isActive || dragging === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    enterCountRef.current = 0;
    setIsOver(false);
    onDrop(dragging);
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
