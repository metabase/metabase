import type {
  CollectionType,
  RegularCollectionId,
  RemoteSyncUnsyncedDependency,
} from "metabase-types/api";

export type DependencyGroupCollection = {
  id: RegularCollectionId;
  name: string;
  type: CollectionType | null;
};

export type DependencyGroup = {
  key: string;
  collection: DependencyGroupCollection | null;
  dependencies: RemoteSyncUnsyncedDependency[];
};

const getTopLevelCollection = ({
  collection,
}: RemoteSyncUnsyncedDependency): DependencyGroupCollection | null => {
  const topLevel = collection?.effective_ancestors[0] ?? collection;
  return topLevel != null && typeof topLevel.id === "number"
    ? { id: topLevel.id, name: topLevel.name, type: topLevel.type }
    : null;
};

export const getDependencyGroups = (
  dependencies: RemoteSyncUnsyncedDependency[],
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
  return [...groups.values()];
};
