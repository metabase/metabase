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
  const newMapping = { ...existingMapping };
  const unusedValues = new Set(values);

  keys.forEach(key => {
    const value = newMapping[key];

    if (value) {
      unusedValues.delete(value);
    }
  });

  keys.forEach(key => {
    if (!newMapping[key]) {
      const value = getPreferredValue(key);

      if (value && unusedValues.has(value)) {
        newMapping[key] = value;
        unusedValues.delete(value);
      }
    }
  });

  keys.forEach((key, index) => {
    if (!unusedValues.size) {
      values.forEach(value => unusedValues.add(value));
    }

    if (!newMapping[key]) {
      const [value] = unusedValues;
      newMapping[key] = value;
      unusedValues.delete(value);
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
  const unsetKeys = new Set(keys);
  const unusedValues = new Set(values);

  keys.forEach(key => {
    const value = newMapping[key];

    if (value) {
      unsetKeys.delete(key);
      unusedValues.delete(value);
    }
  });

  keys.forEach(key => {
    if (!newMapping[key]) {
      const value = getPreferredValue(key);

      if (value && unusedValues.has(value)) {
        newMapping[key] = value;
        unsetKeys.delete(key);
        unusedValues.delete(value);
      }
    }
  });

  for (let attempt = 0; unsetKeys.size > 0; attempt++) {
    if (!unusedValues.size) {
      values.forEach(value => unusedValues.add(value));
    }

    keys.forEach(key => {
      if (!newMapping[key]) {
        const hash = keyHashes[key] + attempt;
        const value = values[hash % values.length];

        if (unusedValues.has(value)) {
          newMapping[key] = value;
          unsetKeys.delete(key);
          unusedValues.delete(value);
        }
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
