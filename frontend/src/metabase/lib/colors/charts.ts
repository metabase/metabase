import { getAccentColors, getHarmonyColors, getPreferredColor } from "./groups";
import { ACCENT_COUNT } from "./palette";

export const getColorsForValues = (
  keys: string[],
  existingMapping: Record<string, string> | null | undefined,
) => {
  if (keys.length <= ACCENT_COUNT) {
    return getHashBasedMapping(
      keys,
      getAccentColors(),
      existingMapping ?? {},
      getPreferredColor,
    );
  } else {
    return getOrderBasedMapping(
      keys,
      getHarmonyColors(),
      existingMapping ?? {},
      getPreferredColor,
    );
  }
};

const getOrderBasedMapping = (
  keys: string[],
  values: string[],
  existingMapping: Record<string, string> = {},
  getPreferredValue: (key: string) => string | undefined,
) => {
  const newMapping: Record<string, string> = {};
  const unusedValues = new Set(values);

  const setValue = (key: string, value: string) => {
    newMapping[key] = value;
    unusedValues.delete(value);
  };

  Object.entries(existingMapping).forEach(([key, value]) => {
    setValue(key, value);
  });

  keys.forEach(key => {
    const value = getPreferredValue(key);

    if (value && unusedValues.has(value)) {
      setValue(key, value);
    }
  });

  keys.forEach((key, index) => {
    if (!unusedValues.size) {
      values.forEach(value => unusedValues.add(value));
    }

    const [value] = unusedValues;

    if (!newMapping[key]) {
      setValue(key, value);
    }
  });

  return newMapping;
};

const getHashBasedMapping = (
  keys: string[],
  values: string[],
  existingMapping: Record<string, string> = {},
  getPreferredValue: (key: string) => string | undefined,
) => {
  const newMapping: Record<string, string> = {};
  const keyHashes = Object.fromEntries(keys.map(k => [k, getHashCode(k)]));
  const unsetKeys = new Set([...keys].sort());
  const allValues = new Set(values);
  const usedValues = new Set();

  const setValue = (key: string, value: string) => {
    newMapping[key] = value;
    unsetKeys.delete(key);

    if (allValues.has(value)) {
      usedValues.add(value);
    }
  };

  Object.entries(existingMapping).forEach(([key, value]) => {
    setValue(key, value);
  });

  unsetKeys.forEach(key => {
    const value = getPreferredValue(key);

    if (value && !usedValues.has(value)) {
      setValue(key, value);
    }
  });

  for (let attempt = 0; unsetKeys.size > 0; attempt++) {
    if (usedValues.size >= allValues.size) {
      usedValues.clear();
    }

    unsetKeys.forEach(key => {
      const hash = keyHashes[key] + attempt;
      const value = values[hash % values.length];

      if (!usedValues.has(value)) {
        setValue(key, value);
      }
    });
  }

  return newMapping;
};

const getHashCode = (s: string) => {
  let h = 0;

  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }

  return Math.abs(h);
};
