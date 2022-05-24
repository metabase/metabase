export function normalizeValue(value: any): any[] {
  if (Array.isArray(value)) {
    return value;
  }

  return value || value === 0 || value === false ? [value] : [];
}
