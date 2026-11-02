import { useLocalStorage } from "@mantine/hooks";

import type { PrototypeSetting } from "./types";

const STORAGE_KEY_PREFIX = "metabase-prototype-setting:";

function isValidValue<S extends PrototypeSetting>(
  setting: S,
  value: unknown,
): value is S["defaultValue"] {
  switch (setting.type) {
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "select":
    case "segmented":
      return (
        typeof value === "string" &&
        setting.options.some((option) => option.value === value)
      );
    case "text":
      return typeof value === "string";
  }
}

function parseStoredValue<S extends PrototypeSetting>(
  setting: S,
  storedValue: string | undefined,
): S["defaultValue"] {
  if (storedValue === undefined) {
    return setting.defaultValue;
  }
  try {
    const value: unknown = JSON.parse(storedValue);
    return isValidValue(setting, value) ? value : setting.defaultValue;
  } catch {
    return setting.defaultValue;
  }
}

/**
 * The current value of a prototype setting and a function to change it.
 * Values are stored in the browser's local storage, so they stay after a
 * reload, and every component that reads the same setting gets the new value.
 * A stored value that is not valid for the setting (for example, an option that
 * no longer exists) gives the default value.
 */
export function usePrototypeSetting<S extends PrototypeSetting>(
  setting: S,
): [S["defaultValue"], (value: S["defaultValue"]) => void] {
  const [value, setValue] = useLocalStorage<S["defaultValue"]>({
    key: STORAGE_KEY_PREFIX + setting.key,
    defaultValue: setting.defaultValue,
    getInitialValueInEffect: false,
    deserialize: (storedValue) => parseStoredValue(setting, storedValue),
  });
  return [value, setValue];
}
