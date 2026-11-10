import { t } from "ttag";

import type {
  IconName,
  RemoteSyncEntity,
  RemoteSyncEntityModel,
  RemoteSyncEntityStatus,
} from "metabase-types/api";

export type ChangesItem = {
  key: string;
  name: string;
  entity: RemoteSyncEntity | null;
  children: RemoteSyncEntity[];
};

export type ChangesGroup = {
  key: string;
  icon: IconName;
  path: string[];
  collectionEntity: RemoteSyncEntity | null;
  items: ChangesItem[];
};

type ModelGroup = {
  key: string;
  icon: IconName;
  getName: () => string;
};

const MODEL_ICONS: Record<RemoteSyncEntityModel, IconName> = {
  action: "bolt",
  card: "table2",
  collection: "folder",
  dashboard: "dashboard",
  dataapp: "app",
  document: "document",
  fieldusersettings: "field",
  glossary: "glossary",
  measure: "sum",
  nativequerysnippet: "snippet",
  pythonlibrary: "code_block",
  segment: "segment",
  tableusersettings: "table",
  timeline: "calendar",
  transform: "insight",
  transformtag: "label",
  transformtest: "list",
};

const DATA_GROUP: ModelGroup = {
  key: "data",
  icon: "database",
  getName: () => t`Data`,
};

const TRANSFORMS_GROUP: ModelGroup = {
  key: "transforms",
  icon: "insight",
  getName: () => t`Transforms`,
};

const MODEL_GROUPS: Partial<Record<RemoteSyncEntityModel, ModelGroup>> = {
  tableusersettings: DATA_GROUP,
  fieldusersettings: DATA_GROUP,
  segment: DATA_GROUP,
  measure: DATA_GROUP,
  transform: TRANSFORMS_GROUP,
  transformtag: TRANSFORMS_GROUP,
  transformtest: TRANSFORMS_GROUP,
  pythonlibrary: TRANSFORMS_GROUP,
  nativequerysnippet: {
    key: "snippets",
    icon: "snippet",
    getName: () => t`Snippets`,
  },
  glossary: { key: "glossary", icon: "glossary", getName: () => t`Glossary` },
  action: { key: "actions", icon: "bolt", getName: () => t`Actions` },
  dataapp: { key: "data-apps", icon: "app", getName: () => t`Data apps` },
};

const OTHER_GROUP: ModelGroup = {
  key: "other",
  icon: "folder",
  getName: () => t`Other content`,
};

export const getModelIcon = (model: RemoteSyncEntityModel): IconName =>
  MODEL_ICONS[model];

export const getStatusIcon = (status: RemoteSyncEntityStatus): IconName => {
  switch (status) {
    case "create":
      return "add";
    case "update":
      return "pencil";
    case "delete":
    case "removed":
      return "trash";
  }
};

export const getStatusColor = (status: RemoteSyncEntityStatus) => {
  switch (status) {
    case "create":
      return "feedback-positive";
    case "update":
      return "core-blue-saturated";
    case "delete":
    case "removed":
      return "feedback-negative";
  }
};

type GroupHeader = Pick<ChangesGroup, "key" | "icon" | "path">;

const getGroupHeader = (entity: RemoteSyncEntity): GroupHeader => {
  if (entity.collection) {
    return {
      key: `collection-${entity.collection.id}`,
      icon: "folder",
      path: [
        ...entity.collection.effective_ancestors.map(({ name }) => name),
        entity.collection.name,
      ],
    };
  }
  const { key, icon, getName } = MODEL_GROUPS[entity.model] ?? OTHER_GROUP;
  return { key, icon, path: [getName()] };
};

const isCollectionOwnChange = (entity: RemoteSyncEntity) =>
  entity.model === "collection" && entity.collection?.id === entity.id;

export const groupChanges = (entities: RemoteSyncEntity[]): ChangesGroup[] => {
  const tables = new Map(
    entities
      .filter((entity) => entity.model === "tableusersettings")
      .map((entity) => [entity.id, entity]),
  );
  const groups = new Map<string, ChangesGroup>();

  const getGroup = (entity: RemoteSyncEntity) => {
    const header = getGroupHeader(entity);
    const group = groups.get(header.key) ?? {
      ...header,
      collectionEntity: null,
      items: [],
    };
    groups.set(header.key, group);
    return group;
  };

  const getTableItem = (group: ChangesGroup, tableId: number, name: string) => {
    const key = `table-${tableId}`;
    const existing = group.items.find((item) => item.key === key);
    if (existing) {
      return existing;
    }
    const item: ChangesItem = { key, name, entity: null, children: [] };
    group.items.push(item);
    return item;
  };

  entities.forEach((entity, index) => {
    const { parent } = entity;
    if (isCollectionOwnChange(entity)) {
      getGroup(entity).collectionEntity = entity;
    } else if (parent?.model === "tableusersettings") {
      const table = tables.get(parent.id);
      const group = getGroup(table ?? entity);
      const name = table?.name ?? parent.name ?? "";
      getTableItem(group, parent.id, name).children.push(entity);
    } else if (entity.model === "tableusersettings") {
      getTableItem(getGroup(entity), entity.id, entity.name).entity = entity;
    } else {
      getGroup(entity).items.push({
        key: `${entity.model}-${entity.id}-${index}`,
        name: entity.name,
        entity,
        children: [],
      });
    }
  });

  return [...groups.values()];
};
