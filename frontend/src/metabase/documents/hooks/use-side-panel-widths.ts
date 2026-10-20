import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { isRecord } from "metabase-types/guards";

const MIN_PANE_WIDTH = 320;
const MAX_TOTAL_WIDTH = 880;
const DEFAULT_WIDTHS: PaneWidths = { settings: 360, palette: 320 };

/**
 * A floating side panel's widths: its settings pane, and the palette pane
 * beside it when there is one.
 */
export type PaneWidths = {
  settings: number;
  palette: number;
};

/** The card's outer edge, or the divider between settings and segments. */
export type ResizeHandle = "outer" | "divider";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const clampWidths = (
  widths: PaneWidths,
  isPaletteOpen: boolean,
): PaneWidths => {
  const palette = clamp(
    widths.palette,
    MIN_PANE_WIDTH,
    MAX_TOTAL_WIDTH - MIN_PANE_WIDTH,
  );
  const maxSettings = isPaletteOpen
    ? MAX_TOTAL_WIDTH - palette
    : MAX_TOTAL_WIDTH;
  return {
    settings: clamp(widths.settings, MIN_PANE_WIDTH, maxSettings),
    palette,
  };
};

/** Moves the divider: one pane grows by what the other gives up. */
const moveDivider = (start: PaneWidths, deltaX: number): PaneWidths => {
  const total = start.settings + start.palette;
  const settings = clamp(
    start.settings + deltaX,
    MIN_PANE_WIDTH,
    total - MIN_PANE_WIDTH,
  );
  return { settings, palette: total - settings };
};

const readWidths = (storageKey: string): PaneWidths => {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(storageKey) ?? "null",
    );
    if (
      isRecord(parsed) &&
      typeof parsed.settings === "number" &&
      typeof parsed.palette === "number"
    ) {
      return { settings: parsed.settings, palette: parsed.palette };
    }
  } catch {
    // Fall back to the defaults.
  }
  return DEFAULT_WIDTHS;
};

const writeWidths = (storageKey: string, widths: PaneWidths) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(widths));
  } catch {
    // Widths just won't be remembered.
  }
};

type UseSidePanelWidthsArgs = {
  /** Where the widths are remembered, per kind of panel. */
  storageKey: string;
  isPaletteOpen: boolean;
};

/**
 * Widths of a floating side panel's panes, resized by dragging the card's
 * outer edge or the divider between them, and remembered across sessions.
 * Each pane is at least 320px, and together they're at most 880px.
 */
export const useSidePanelWidths = ({
  storageKey,
  isPaletteOpen,
}: UseSidePanelWidthsArgs) => {
  const [storedWidths, setStoredWidths] = useState(() =>
    readWidths(storageKey),
  );
  const [activeHandle, setActiveHandle] = useState<ResizeHandle | null>(null);
  const stopResizeRef = useRef<(() => void) | null>(null);
  const widths = clampWidths(storedWidths, isPaletteOpen);

  useEffect(() => () => stopResizeRef.current?.(), []);

  const startResize = (
    handle: ResizeHandle,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    const startX = event.clientX;
    const start = widths;
    let latest = start;

    const handleMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      latest =
        handle === "outer"
          ? // The outer edge is on the left, so dragging left widens.
            clampWidths(
              { ...start, settings: start.settings - deltaX },
              isPaletteOpen,
            )
          : moveDivider(start, deltaX);
      setStoredWidths(latest);
    };

    const stopResize = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stopResize);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      stopResizeRef.current = null;
      setActiveHandle(null);
      writeWidths(storageKey, latest);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stopResize);
    document.body.style.setProperty("cursor", "col-resize");
    document.body.style.setProperty("user-select", "none");
    stopResizeRef.current = stopResize;
    setActiveHandle(handle);
  };

  return { widths, activeHandle, startResize };
};
