import { getAccentColors, getPreferredColor } from "./groups";
import { ACCENT_COUNT } from "./palette";
import type { ColorPalette } from "./types";

export const getColorsForValues = (
  keys: string[],
  existingMapping?: Record<string, string> | null,
  palette?: ColorPalette,
) => {
  if (keys.length <= ACCENT_COUNT) {
    return getHashBasedMapping(
      keys,
      getAccentColors({ light: false, dark: false }, palette),
      existingMapping,
      (color: string) => getPreferredColor(color, palette),
    );
  } else {
    return getOrderBasedMapping(
      keys,
      getAccentColors(
        { light: keys.length > ACCENT_COUNT * 2, harmony: true },
        palette,
      ),
      existingMapping,
      (color: string) => getPreferredColor(color, palette),
    );
  }
};

const getOrderBasedMapping = (
  keys: string[],
  values: string[],
  existingMapping: Record<string, string> | null | undefined,
  getPreferredValue: (key: string) => string | undefined,
) => {
  const newMapping: Record<string, string> = {};
  const usedValues = new Set<string>();
  const unusedValues = new Set(values);

  const setValue = (key: string, value: string) => {
    newMapping[key] = value;
    usedValues.add(value);
    unusedValues.delete(value);
  };

  keys.forEach(key => {
    const value = existingMapping?.[key];

    if (value) {
      setValue(key, value);
    }
  });

  keys.forEach(key => {
    if (!newMapping[key]) {
      const value = getPreferredValue(key);

      if (value && !usedValues.has(value)) {
        setValue(key, value);
      }
    }
  });

  keys.forEach(key => {
    if (!unusedValues.size) {
      values.forEach(value => unusedValues.add(value));
    }

    if (!newMapping[key]) {
      const [value] = unusedValues;
      setValue(key, value);
    }
  });

  return newMapping;
};

const getHashBasedMapping = (
  keys: string[],
  values: string[],
  existingMapping: Record<string, string> | null | undefined,
  getPreferredValue: (key: string) => string | undefined,
) => {
  const newMapping: Record<string, string> = {};
  const sortedKeys = [...keys].sort();
  const keyHashes = Object.fromEntries(keys.map(k => [k, getHashCode(k)]));
  const unsetKeys = new Set(keys);
  const usedValues = new Set<string>();
  const unusedValues = new Set(values);

  const setValue = (key: string, value: string) => {
    newMapping[key] = value;
    unsetKeys.delete(key);
    usedValues.add(value);
    unusedValues.delete(value);
  };

  sortedKeys.forEach(key => {
    const value = existingMapping?.[key];

    if (value) {
      setValue(key, value);
    }
  });

  sortedKeys.forEach(key => {
    if (!newMapping[key]) {
      const value = getPreferredValue(key);

      if (value && !usedValues.has(value)) {
        setValue(key, value);
      }
    }
  });

  for (let attempt = 0; unsetKeys.size > 0; attempt++) {
    if (!unusedValues.size) {
      values.forEach(value => unusedValues.add(value));
    }

    sortedKeys.forEach(key => {
      if (!newMapping[key]) {
        const hash = keyHashes[key] + attempt;
        const value = values[hash % values.length];

        if (unusedValues.has(value)) {
          setValue(key, value);
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
