export function createLookupByProperty(items: any[], property: string) {
  const lookup: Record<string, any> = {};

  for (const item of items) {
    lookup[item[property]] = item;
  }

  return lookup;
}
