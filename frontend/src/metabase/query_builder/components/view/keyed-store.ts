import { useSyncExternalStore } from "react";

/**
 * Prototype-only, in-memory store of values by key, kept for the lifetime of the page.
 * Values may hold Lib objects, which aren't serializable, so this stays out of Redux.
 */
export function createKeyedStore<T>() {
  let valuesByKey: ReadonlyMap<string, T> = new Map();
  const listeners = new Set<() => void>();

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const update = (nextValues: ReadonlyMap<string, T>) => {
    valuesByKey = nextValues;
    listeners.forEach((listener) => listener());
  };

  return {
    /** The value stored for `key`, or `undefined` when there is none. */
    useValue(key: string | null): T | undefined {
      return useSyncExternalStore(subscribe, () =>
        key != null ? valuesByKey.get(key) : undefined,
      );
    },
    set(key: string, value: T) {
      update(new Map(valuesByKey).set(key, value));
    },
    get(key: string): T | undefined {
      return valuesByKey.get(key);
    },
  };
}
