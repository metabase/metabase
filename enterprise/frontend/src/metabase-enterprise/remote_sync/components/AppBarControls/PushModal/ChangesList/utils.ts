import type {
  CollectionEssentials,
  IconName,
  RemoteSyncDirtyItem,
  RemoteSyncDirtyItemStatus,
} from "metabase-types/api";

import {
  type RemoteSyncItemTable,
  getItemCollections,
  getItemSection,
  getItemTable,
  isItemCollection,
  isItemTable,
} from "../../../../utils";

export type ChangesItem = {
  key: string;
  name: string;
  entity: RemoteSyncDirtyItem | null;
  children: RemoteSyncDirtyItem[];
};

export type ChangesGroup = {
  key: string;
  icon: IconName;
  path: string[];
  collectionEntity: RemoteSyncDirtyItem | null;
  items: ChangesItem[];
};

export function getStatusIcon(status: RemoteSyncDirtyItemStatus): IconName {
  switch (status) {
    case "create":
      return "add";
    case "update":
      return "pencil";
    case "delete":
    case "removed":
      return "trash";
  }
}

export function getStatusColor(status: RemoteSyncDirtyItemStatus) {
  switch (status) {
    case "create":
      return "feedback-positive";
    case "update":
      return "core-blue-saturated";
    case "delete":
    case "removed":
      return "feedback-negative";
  }
}

type GroupHeader = Pick<ChangesGroup, "key" | "icon" | "path">;

function getGroupHeader(
  change: RemoteSyncDirtyItem,
  collections: CollectionEssentials[],
): GroupHeader {
  const collection = collections.at(-1);
  if (collection) {
    return {
      key: `collection-${collection.id}`,
      icon: "folder",
      path: collections.map(({ name }) => name),
    };
  }
  const { key, icon, name } = getItemSection(change);
  return { key, icon, path: [name] };
}

export function groupChanges(changes: RemoteSyncDirtyItem[]): ChangesGroup[] {
  const groups = new Map<string, ChangesGroup>();

  const getGroup = (
    change: RemoteSyncDirtyItem,
    collections: CollectionEssentials[],
  ) => {
    const header = getGroupHeader(change, collections);
    const group = groups.get(header.key) ?? {
      ...header,
      collectionEntity: null,
      items: [],
    };
    groups.set(header.key, group);
    return group;
  };

  const getTableItem = (group: ChangesGroup, table: RemoteSyncItemTable) => {
    const key = `table-${table.id}`;
    const existing = group.items.find((item) => item.key === key);
    if (existing) {
      return existing;
    }
    const item: ChangesItem = {
      key,
      name: table.display_name ?? table.name,
      entity: null,
      children: [],
    };
    group.items.push(item);
    return item;
  };

  changes.forEach((change, index) => {
    const collections = getItemCollections(change);
    const collection = collections.at(-1);
    const table = getItemTable(change);
    const group = getGroup(change, collections);
    if (table && isItemTable(change, table)) {
      getTableItem(group, table).entity = change;
    } else if (table) {
      getTableItem(group, table).children.push(change);
    } else if (collection && isItemCollection(change, collection)) {
      group.collectionEntity = change;
    } else {
      group.items.push({
        key: `${change.model}-${change.id}-${index}`,
        name: change.name,
        entity: change,
        children: [],
      });
    }
  });

  return [...groups.values()];
}
