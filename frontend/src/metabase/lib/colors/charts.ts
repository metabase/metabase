import { getAccentColors, getPreferredColor } from "./groups";
import { ACCENT_COUNT } from "./palette";
import type { ColorPalette } from "./types";

export const getColorsForValues = (
  keys: string[],
  existingMapping?: Record<string, string> | null,
  palette?: ColorPalette,
  seriesVizSettingsDefaultKeys?: string[],
) => {
  if (keys.length <= ACCENT_COUNT) {
    return getHashBasedMapping(
      keys,
      getAccentColors({ light: false, dark: false, gray: false }, palette),
      existingMapping,
      (color: string) => getPreferredColor(color, palette),
      seriesVizSettingsDefaultKeys,
    );
  } else {
    return getOrderBasedMapping(
      keys,
      getAccentColors(
        { light: keys.length > ACCENT_COUNT * 2, harmony: true, gray: false },
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

  keys.forEach((key) => {
    const value = existingMapping?.[key];

    if (value) {
      setValue(key, value);
    }
  });

  keys.forEach((key) => {
    if (!newMapping[key]) {
      const value = getPreferredValue(key);

      if (value && !usedValues.has(value)) {
        setValue(key, value);
      }
    }
  });

  keys.forEach((key) => {
    if (!unusedValues.size) {
      values.forEach((value) => unusedValues.add(value));
    }

    if (!newMapping[key]) {
      const [value] = unusedValues;
      setValue(key, value);
    }
  });

  return newMapping;
};

/**
 * Generates a mapping of keys to colors based on a hash of the keys.
 *
 * @param keys the keys to assign colors to
 * @param values the available colors to assign
 * @param existingMapping possibly existing mapping of keys to colors
 * @param getPreferredValue a function that returns a preferred color for a key
 * @param seriesVizSettingsDefaultKeys possible keys to use for hashing
 * @returns a mapping of keys to colors
 */
const getHashBasedMapping = (
  keys: string[],
  values: string[],
  existingMapping: Record<string, string> | null | undefined,
  getPreferredValue: (key: string) => string | undefined,
  seriesVizSettingsDefaultKeys?: string[],
) => {
  const newMapping: Record<string, string> = {};
  const sortedKeys = [...keys].sort();
  // If seriesVizSettingsDefaultKeys is provided, we sort it in the same order as keys
  // to ensure that the hash codes are consistent with the sorted keys.
  const sortedDefaultKeys = seriesVizSettingsDefaultKeys
    ? sortedKeys.map((k) => seriesVizSettingsDefaultKeys[keys.indexOf(k)])
    : undefined;
  const keyHashes = Object.fromEntries(
    keys.map((k, i) => [k, getHashCode(sortedDefaultKeys?.[i] ?? k)]),
  );
  const unsetKeys = new Set(keys);
  const usedValues = new Set<string>();
  const unusedValues = new Set(values);

  const setValue = (key: string, value: string) => {
    newMapping[key] = value;
    unsetKeys.delete(key);
    usedValues.add(value);
    unusedValues.delete(value);
  };

  // Let's look for existing values first (as in, values set explicitly
  // in the settings) and set them in the new mapping
  sortedKeys.forEach((key) => {
    const value = existingMapping?.[key];

    if (value) {
      setValue(key, value);
    }
  });

  // if we haven't found a value for a key,
  // let's try to find a preferred value for it (e.g. count gets its own specific color)
  // see frontend/src/metabase/lib/colors/groups.ts, getPreferredColor()
  sortedKeys.forEach((key, i) => {
    if (!newMapping[key]) {
      const value = getPreferredValue(sortedDefaultKeys?.[i] ?? key);

      if (value && !usedValues.has(value)) {
        setValue(key, value);
      }
    }
  });

  // this loops through the keys that are still unset
  // and tries to set them to a value that is not used yet
  // the new color is chosen based on the hash of the key
  // and the attempt number (to avoid infinite loops)
  for (let attempt = 0; unsetKeys.size > 0; attempt++) {
    // if we run out of unused values, we reset the set of unused values
    // with all values again
    if (!unusedValues.size) {
      values.forEach((value) => unusedValues.add(value));
    }

    sortedKeys.forEach((key) => {
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
