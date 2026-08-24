import {
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";

const MIN_PANEL_HEIGHT = 140;

/** Keeps a part of the app visible above a panel dragged to full height. */
const VIEWPORT_MARGIN = 100;

const SSR_VIEWPORT_HEIGHT = 960;

const getViewportHeight = () =>
  typeof window !== "undefined" ? window.innerHeight : SSR_VIEWPORT_HEIGHT;

const clampToViewport = (height: number, viewportHeight: number) =>
  Math.min(
    Math.max(height, MIN_PANEL_HEIGHT),
    // A viewport shorter than the minimum would invert the bounds.
    Math.max(viewportHeight - VIEWPORT_MARGIN, MIN_PANEL_HEIGHT),
  );

/**
 * The bottom-docked panel's height, and the drag handler for its top edge.
 *
 * Until the author drags, the height follows the viewport (a third of it);
 * after that their height is kept, clamped so a shrinking window can't leave
 * the panel taller than the screen.
 *
 * A drag binds its listeners to `window`, since the pointer routinely leaves
 * the handle mid-drag. They are removed on mouse-up, on `blur` (a release the
 * page never sees — alt-tab, or the cursor over an iframe), and on unmount.
 */
export const usePanelResize = () => {
  const [draggedHeight, setDraggedHeight] = useState<number | null>(null);
  const [viewportHeight, setViewportHeight] = useState(getViewportHeight);
  const stopResizeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const onViewportResize = () => setViewportHeight(getViewportHeight());

    window.addEventListener("resize", onViewportResize);

    return () => {
      window.removeEventListener("resize", onViewportResize);
      stopResizeRef.current?.();
    };
  }, []);

  const height = clampToViewport(
    draggedHeight ?? Math.round(viewportHeight / 3),
    viewportHeight,
  );

  const startResize = (event: ReactMouseEvent) => {
    event.preventDefault();

    const startY = event.clientY;
    const startHeight = height;

    const onMove = (moveEvent: MouseEvent) => {
      setDraggedHeight(
        clampToViewport(
          startHeight + (startY - moveEvent.clientY),
          getViewportHeight(),
        ),
      );
    };

    const stopResize = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stopResize);
      window.removeEventListener("blur", stopResize);
      stopResizeRef.current = null;
    };

    stopResizeRef.current = stopResize;

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stopResize);
    window.addEventListener("blur", stopResize);
  };

  return { height, startResize };
};
