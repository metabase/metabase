export function normalizeValue<T>(value: T[] | undefined): T[];
export function normalizeValue<T>(value: T | undefined): T[];
export function normalizeValue<T>(value: T | T[] | undefined): T[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (value || value === 0) {
    return [value];
  }

  return [];
}
