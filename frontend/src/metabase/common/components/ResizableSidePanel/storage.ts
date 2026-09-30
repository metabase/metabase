import { isObject } from "metabase-types/guards";

// All panels share one localStorage entry, keyed by each panel's `storageKey`.
const STORAGE_KEY = "metabase-side-panel-widths";

function readWidths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!isObject(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === "number" && Number.isFinite(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

function writeWidths(widths: Record<string, number>): void {
  try {
    if (Object.keys(widths).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
    }
  } catch {
    // Ignore write failures (e.g. storage disabled or quota exceeded).
  }
}

export function getStoredSidePanelWidth(
  storageKey: string,
): number | undefined {
  return readWidths()[storageKey];
}

/** Stores a user-resized width, or forgets it when `width` is undefined. */
export function setStoredSidePanelWidth(
  storageKey: string,
  width: number | undefined,
): void {
  const widths = readWidths();
  if (width === undefined) {
    delete widths[storageKey];
  } else {
    widths[storageKey] = width;
  }
  writeWidths(widths);
}
