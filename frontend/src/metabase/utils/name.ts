export type ItemWithName = {
  name: string;
  display_name?: string;
};

/**
 * items may or may not have display names, but we should prefer displaying them when they do.
 */
export function getName(item: ItemWithName): string;
export function getName(
  item: ItemWithName | null | undefined,
): string | undefined;
export function getName(
  item: ItemWithName | null | undefined,
): string | undefined {
  if (!item) {
    return undefined;
  }
  return item.display_name || item.name;
}
