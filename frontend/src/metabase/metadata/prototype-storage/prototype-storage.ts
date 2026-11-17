import { useCallback, useMemo, useSyncExternalStore } from "react";

const CHANGE_EVENT = "metabase-prototype-storage-change";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readRaw(key: string): string {
  return window.localStorage.getItem(key) ?? "";
}

function parseRaw<T>(raw: string, parse: (value: unknown) => T): T {
  if (raw === "") {
    return parse(undefined);
  }
  try {
    const value: unknown = JSON.parse(raw);
    return parse(value);
  } catch {
    return parse(undefined);
  }
}

/**
 * PROTOTYPE: mocked settings that have no API yet, kept in localStorage so
 * they survive reloads and reach every page and tab.
 *
 * `parse` validates what's stored and returns the default for anything it
 * doesn't recognise, including `undefined` when nothing is stored.
 */
export function usePrototypeStorage<T>(
  key: string,
  parse: (value: unknown) => T,
): [T, (update: (current: T) => T) => void] {
  // The raw string is the snapshot: it's stable between changes, unlike a parse
  const raw = useSyncExternalStore(subscribe, () => readRaw(key));
  const state = useMemo(() => parseRaw(raw, parse), [raw, parse]);

  const update = useCallback(
    (updater: (current: T) => T) => {
      const current = parseRaw(readRaw(key), parse);
      window.localStorage.setItem(key, JSON.stringify(updater(current)));
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [key, parse],
  );

  return [state, update];
}
