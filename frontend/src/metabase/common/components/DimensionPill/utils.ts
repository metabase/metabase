import type { DimensionGroup } from "metabase-lib/metric";

export type ListSection<TItem> = {
  name?: string;
  items?: TItem[];
};

interface Groupable {
  group?: DimensionGroup;
}

export function groupIntoSections<T extends Groupable>(
  items: T[],
): ListSection<T>[] {
  const groups = new Map<
    string | undefined,
    { groupName: string; items: T[] }
  >();

  for (const item of items) {
    const groupId = item.group?.id;
    const entry = groups.get(groupId);
    if (entry) {
      entry.items.push(item);
    } else {
      groups.set(groupId, {
        groupName: item.group?.displayName ?? "",
        items: [item],
      });
    }
  }

  if (groups.size <= 1) {
    return [{ items }];
  }

  return [...groups.values()].map(({ groupName, items }) => ({
    name: groupName,
    items,
  }));
}
