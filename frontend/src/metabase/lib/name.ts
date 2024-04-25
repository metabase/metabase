type ItemWithName = {
  name: string;
  displayName?: string;
};

/** items may or may not have display names, but we should prefer displaying them when they do */
export const getName = (item: ItemWithName): string =>
  item.displayName || item.name;
