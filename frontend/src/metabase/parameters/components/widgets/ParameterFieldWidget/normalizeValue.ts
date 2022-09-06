export function normalizeValue(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }

  return value || value === 0 ? [value] : [];
}
