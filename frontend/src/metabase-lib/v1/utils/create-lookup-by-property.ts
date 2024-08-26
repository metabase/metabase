export function createLookupByProperty<T>(items: T[], property: keyof T) {
  const lookup: Record<string, T> = {};

  for (const item of items) {
    lookup[item[property] as unknown as string] = item;
  }

  return lookup;
}
