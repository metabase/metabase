import { useSyncExternalStore } from "react";

/** Prototype-only feature switches, toggled from the floating debug pill. */
export const PROTOTYPE_FLAGS = [
  { key: "event-analytics", label: "Product event analytics" },
] as const;

export type PrototypeFlag = (typeof PROTOTYPE_FLAGS)[number]["key"];

type PrototypeFlagValues = Record<PrototypeFlag, boolean>;

const STORAGE_KEY = "metabase-prototype-flags";

const DEFAULT_VALUES: PrototypeFlagValues = {
  "event-analytics": true,
};

const listeners = new Set<() => void>();

const readStoredValues = (): Partial<Record<string, unknown>> => {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
};

const readValues = (): PrototypeFlagValues => {
  const stored = readStoredValues();
  const result = { ...DEFAULT_VALUES };
  PROTOTYPE_FLAGS.forEach(({ key }) => {
    const value = stored[key];
    if (typeof value === "boolean") {
      result[key] = value;
    }
  });
  return result;
};

let values = readValues();

const notify = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      values = readValues();
      notify();
    }
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
};

export const setPrototypeFlag = (flag: PrototypeFlag, isEnabled: boolean) => {
  values = { ...values, [flag]: isEnabled };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  notify();
};

/** Whether a prototype flag is on; re-renders when it changes, in any tab. */
export const usePrototypeFlag = (flag: PrototypeFlag): boolean =>
  useSyncExternalStore(subscribe, () => values[flag]);
