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

function getTopLevelCollection(
  dependency: RemoteSyncItem,
): DependencyGroupCollection | null {
  const [topLevel] = getItemCollections(dependency);
  return topLevel != null && typeof topLevel.id === "number"
    ? { id: topLevel.id, name: topLevel.name }
    : null;
}

function compareNames(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export function sortItems(items: RemoteSyncItem[]): RemoteSyncItem[] {
  return [...items].sort((a, b) =>
    compareNames(getItemName(a), getItemName(b)),
  );
}

function sortGroups(groups: DependencyGroup[]): DependencyGroup[] {
  return [...groups].sort((a, b) =>
    a.collection == null || b.collection == null
      ? Number(a.collection == null) - Number(b.collection == null)
      : compareNames(a.collection.name, b.collection.name),
  );
}

export function getDependencyGroups(
  dependencies: RemoteSyncItem[],
): DependencyGroup[] {
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
}
