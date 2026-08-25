type NonArray<T> = Exclude<T, any[]>;

export function normalizeValue<T>(
  value: NonArray<T> | NonArray<T>[] | undefined,
): T[] {
  if (Array.isArray(value)) {
    // Unjustified type cast. FIXME
    return value as T[];
  }

  if (value || value === 0) {
    return [value];
  }

  return [];
}
