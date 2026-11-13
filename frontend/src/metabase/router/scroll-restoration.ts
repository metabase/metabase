import type { Location } from "react-router";

const STORAGE_KEY = "metabase-scroll-positions";
const MAX_STORED_ENTRIES = 100;
const RESTORE_WINDOW_MS = 3000;
const USER_SCROLL_INTENT_EVENTS = [
  "wheel",
  "touchstart",
  "keydown",
  "pointerdown",
] as const;
const LISTENER_OPTIONS = { capture: true, passive: true } as const;

/**
 * Marks a scroll container that persists across navigations as a page's
 * scroller, so a navigation to a new path scrolls it back to the top. Spread it
 * onto the element: `<Box {...RESET_SCROLL_ON_NAVIGATE} />`.
 */
export const RESET_SCROLL_ON_NAVIGATE = {
  "data-reset-scroll-on-navigate": "",
} as const;

const RESET_SCROLL_ON_NAVIGATE_SELECTOR = "[data-reset-scroll-on-navigate]";

/** Scroll offsets saved for one history entry, by element key. */
export type EntryScrollPositions = ReadonlyMap<string, number>;

export type ScrollPositionStore = {
  get: (entryKey: string) => EntryScrollPositions | undefined;
  record: (entryKey: string, elementKey: string, scrollTop: number) => void;
  persist: () => void;
};

type StoredEntries = Map<string, Map<string, number>>;

/** The form `StoredEntries` takes in sessionStorage, which has no `Map`. */
type SerializedEntry = [
  entryKey: string,
  positions: [elementKey: string, scrollTop: number][],
];

/**
 * The key of the history entry `location` is on. react-router gives every entry
 * a page load lands on the key "default", so the path tells those apart.
 */
export function getHistoryEntryKey(
  location: Pick<Location, "key" | "pathname">,
): string {
  return location.key === "default"
    ? `default:${location.pathname}`
    : location.key;
}

/**
 * A selector that finds the element at the same place in the document after a
 * remount, built from each ancestor's tag and position. Returns `null` for an
 * element outside `document.body`.
 */
export function getElementKey(element: Element): string | null {
  const segments: string[] = [];
  let current = element;

  while (current !== document.body) {
    const parent = current.parentElement;
    if (!parent) {
      return null;
    }
    const position = Array.from(parent.children).indexOf(current) + 1;
    segments.unshift(`${current.localName}:nth-child(${position})`);
    current = parent;
  }

  return ["body", ...segments].join(" > ");
}

function findElement(elementKey: string): Element | null {
  try {
    return document.querySelector(elementKey);
  } catch {
    // A key read back from storage may not be a valid selector.
    return null;
  }
}

function serializeEntries(entries: StoredEntries): SerializedEntry[] {
  return Array.from(entries, ([entryKey, positions]) => [
    entryKey,
    Array.from(positions),
  ]);
}

const isUnknownArray = (value: unknown): value is unknown[] =>
  Array.isArray(value);

const isSerializedPosition = (
  value: unknown,
): value is SerializedEntry[1][number] =>
  isUnknownArray(value) &&
  value.length === 2 &&
  typeof value[0] === "string" &&
  typeof value[1] === "number";

const isSerializedEntry = (value: unknown): value is SerializedEntry =>
  isUnknownArray(value) &&
  value.length === 2 &&
  typeof value[0] === "string" &&
  isUnknownArray(value[1]) &&
  value[1].every(isSerializedPosition);

/** Reads back what `serializeEntries` wrote, or nothing if it doesn't match. */
function deserializeEntries(value: unknown): StoredEntries {
  if (!isUnknownArray(value) || !value.every(isSerializedEntry)) {
    return new Map();
  }
  return new Map(
    value.map(([entryKey, positions]) => [entryKey, new Map(positions)]),
  );
}

function readStoredEntries(): StoredEntries {
  try {
    const stored: unknown = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "[]",
    );
    return deserializeEntries(stored);
  } catch {
    return new Map();
  }
}

/**
 * Holds the scroll offsets of every history entry, oldest first, capped at
 * `MAX_STORED_ENTRIES`. It starts from what the tab saved to sessionStorage,
 * and `persist` saves it back. When storage is unavailable it keeps working in
 * memory, so only a reload loses the offsets.
 */
export function createScrollPositionStore(): ScrollPositionStore {
  const entries = readStoredEntries();

  return {
    get: (entryKey) => entries.get(entryKey),
    record: (entryKey, elementKey, scrollTop) => {
      let positions = entries.get(entryKey);
      if (!positions) {
        positions = new Map();
        entries.set(entryKey, positions);
        if (entries.size > MAX_STORED_ENTRIES) {
          const [oldestEntryKey] = entries.keys();
          entries.delete(oldestEntryKey);
        }
      }
      positions.set(elementKey, scrollTop);
    },
    persist: () => {
      try {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(serializeEntries(entries)),
        );
      } catch {
        // Blocked or full storage only costs restoring after a reload.
      }
    },
  };
}

/**
 * Records the scroll offset of any element the user or the app scrolls, under
 * the history entry `getEntryKey` returns at that moment. Returns a function
 * that stops recording.
 */
export function trackScrollPositions(
  store: ScrollPositionStore,
  getEntryKey: () => string,
): () => void {
  const handleScroll = (event: Event) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const elementKey = getElementKey(event.target);
    if (elementKey) {
      store.record(getEntryKey(), elementKey, event.target.scrollTop);
    }
  };

  document.addEventListener("scroll", handleScroll, LISTENER_OPTIONS);
  return () =>
    document.removeEventListener("scroll", handleScroll, LISTENER_OPTIONS);
}

/**
 * Scrolls each element back to its saved offset, and keeps putting it back
 * until `RESTORE_WINDOW_MS` passes or the user starts scrolling. A page often
 * renders before its data loads, and while it is too short the browser lowers
 * the offset to fit, so a single scroll would not stick. Returns a function
 * that stops it early.
 */
export function restoreScrollPositions(
  positions: EntryScrollPositions,
): () => void {
  const startedAt = performance.now();
  let frameId: number | null = null;

  const stop = () => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    USER_SCROLL_INTENT_EVENTS.forEach((type) =>
      document.removeEventListener(type, stop, LISTENER_OPTIONS),
    );
  };

  const applyWhereMoved = () => {
    positions.forEach((scrollTop, elementKey) => {
      const element = findElement(elementKey);
      // Offsets can be fractional on a zoomed page, and may not read back
      // exactly as they were set.
      if (element && Math.abs(element.scrollTop - scrollTop) >= 1) {
        element.scrollTop = scrollTop;
      }
    });
  };

  const tick = () => {
    applyWhereMoved();
    if (performance.now() - startedAt < RESTORE_WINDOW_MS) {
      frameId = requestAnimationFrame(tick);
    } else {
      stop();
    }
  };

  USER_SCROLL_INTENT_EVENTS.forEach((type) =>
    document.addEventListener(type, stop, LISTENER_OPTIONS),
  );
  tick();
  return stop;
}

/**
 * Forgets the offsets saved to sessionStorage, which outlives a test's router.
 * The jest harness calls this after each test.
 */
export function resetScrollPositionsForTests(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Node test environments have no sessionStorage.
  }
}

/** Scrolls every page scroller marked with `RESET_SCROLL_ON_NAVIGATE` to the top. */
export function resetPageScrollPositions(): void {
  document
    .querySelectorAll(RESET_SCROLL_ON_NAVIGATE_SELECTOR)
    .forEach((element) => {
      element.scrollTop = 0;
    });
}
