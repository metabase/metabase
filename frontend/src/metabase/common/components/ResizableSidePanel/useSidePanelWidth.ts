import { useState } from "react";

import { getStoredSidePanelWidth, setStoredSidePanelWidth } from "./storage";

type UseSidePanelWidthOptions = {
  /** Where the user's width is remembered. Omit to skip persistence. */
  storageKey?: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
};

function getInitialWidth({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
}: UseSidePanelWidthOptions): number {
  const storedWidth =
    storageKey === undefined ? undefined : getStoredSidePanelWidth(storageKey);
  if (storedWidth === undefined) {
    return defaultWidth;
  }
  // A stored width may predate a change to the panel's limits.
  return Math.min(Math.max(storedWidth, minWidth), maxWidth);
}

/**
 * Tracks a side panel's width, starting from the width the user last resized
 * it to (if any) and re-initializing when the key or default width changes.
 * Only widths that differ from the default are persisted.
 */
export function useSidePanelWidth(options: UseSidePanelWidthOptions) {
  const { storageKey, defaultWidth } = options;
  const [width, setWidth] = useState(() => getInitialWidth(options));
  const [source, setSource] = useState({ storageKey, defaultWidth });

  if (
    source.storageKey !== storageKey ||
    source.defaultWidth !== defaultWidth
  ) {
    setSource({ storageKey, defaultWidth });
    setWidth(getInitialWidth(options));
  }

  const persistWidth = (newWidth: number) => {
    if (storageKey !== undefined) {
      setStoredSidePanelWidth(
        storageKey,
        newWidth === defaultWidth ? undefined : newWidth,
      );
    }
  };

  return { width, setWidth, persistWidth };
}
