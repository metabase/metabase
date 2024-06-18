type ItemWithName = {
  name: string;
  display_name?: string;
};

/** items may or may not have display names, but we should prefer displaying them when they do */
export const getName = (item: ItemWithName): string =>
  item.display_name || item.name;
