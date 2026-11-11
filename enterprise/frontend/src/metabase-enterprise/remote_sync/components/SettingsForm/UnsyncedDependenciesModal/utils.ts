import type { RemoteSyncItem, RemoteSyncItemId } from "metabase-types/api";

import { getItemCollections, getItemName } from "../../../utils";

export type DependencyGroupCollection = {
  id: RemoteSyncItemId;
  name: string;
};

export type DependencyGroup = {
  key: string;
  collection: DependencyGroupCollection | null;
  dependencies: RemoteSyncItem[];
};

const getTopLevelCollection = (
  dependency: RemoteSyncItem,
): DependencyGroupCollection | null => {
  const [topLevel] = getItemCollections(dependency);
  return topLevel != null && typeof topLevel.id === "number"
    ? { id: topLevel.id, name: topLevel.name }
    : null;
};

const compareNames = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "base" });

export const sortItems = (items: RemoteSyncItem[]): RemoteSyncItem[] =>
  [...items].sort((a, b) => compareNames(getItemName(a), getItemName(b)));

const sortGroups = (groups: DependencyGroup[]): DependencyGroup[] =>
  [...groups].sort((a, b) =>
    a.collection == null || b.collection == null
      ? Number(a.collection == null) - Number(b.collection == null)
      : compareNames(a.collection.name, b.collection.name),
  );

export const getDependencyGroups = (
  dependencies: RemoteSyncItem[],
): DependencyGroup[] => {
  const groups = new Map<string, DependencyGroup>();
  dependencies.forEach((dependency) => {
    const collection = getTopLevelCollection(dependency);
    const key = collection != null ? String(collection.id) : "none";
    const group = groups.get(key) ?? { key, collection, dependencies: [] };
    groups.set(key, {
      ...group,
      dependencies: [...group.dependencies, dependency],
    });
  });
  return sortGroups(
    [...groups.values()].map((group) => ({
      ...group,
      dependencies: sortItems(group.dependencies),
    })),
  );
};
