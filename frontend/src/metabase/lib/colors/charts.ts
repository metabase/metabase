const getHashBasedMapping = (
  keys: string[],
  values: string[],
  existingMapping: Record<string, string> | null | undefined,
  getPreferredValue: (key: string) => string | undefined,
) => {
  const mapping: Record<string, string> = {};
  const keyHashes = Object.fromEntries(keys.map(k => [k, getHashCode(k)]));
  const unsetKeys = new Set([...keys].sort());
  const allValues = new Set(values);
  const usedValues = new Set();

  const setValue = (key: string, value: string) => {
    mapping[key] = value;
    unsetKeys.delete(key);

    if (allValues.has(value)) {
      usedValues.add(value);
    }
  };

  if (existingMapping) {
    Object.entries(existingMapping).forEach(([key, value]) => {
      setValue(key, value);
    });
  }

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

  return mapping;
};

const getHashCode = (s: string) => {
  let h = 0;

  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }

  return Math.abs(h);
};
