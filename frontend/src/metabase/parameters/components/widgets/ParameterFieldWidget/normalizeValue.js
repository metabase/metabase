export function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : [];
}
