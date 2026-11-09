import { t } from "ttag";

import * as Urls from "metabase/urls";
import type {
  IconName,
  RemoteSyncEntity,
  RemoteSyncEntityModel,
  RemoteSyncEntityStatus,
} from "metabase-types/api";

export type ChangesGroup = {
  key: string;
  icon: IconName;
  path: string[];
  entities: RemoteSyncEntity[];
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

export const getStatusIcon = (status: RemoteSyncEntityStatus): IconName =>
  status === "create" ? "add" : status === "update" ? "pencil" : "trash";

export const getStatusColor = (status: RemoteSyncEntityStatus) =>
  status === "create"
    ? "feedback-positive"
    : status === "update"
      ? "core-blue-saturated"
      : "feedback-negative";

export const getEntityUrl = (entity: RemoteSyncEntity): string | null => {
  switch (entity.model) {
    case "tableusersettings":
      return Urls.dataStudioTable(entity.id);
    case "fieldusersettings":
      return entity.table_id != null
        ? Urls.dataStudioTableFields(entity.table_id, entity.id)
        : null;
    case "segment":
      return entity.table_id != null
        ? Urls.dataStudioPublishedTableSegment(entity.table_id, entity.id)
        : null;
    case "measure":
      return entity.table_id != null
        ? Urls.dataStudioPublishedTableMeasure(entity.table_id, entity.id)
        : null;
    case "transformtest":
      return entity.transform_id != null
        ? Urls.transformTest(entity.transform_id, entity.id)
        : null;
    case "action":
      return entity.model_id != null
        ? Urls.action({ id: entity.model_id }, entity.id)
        : Urls.dataStudioAction(entity.id);
    case "dataapp":
      return Urls.dataStudioDataApp(entity.name);
    case "nativequerysnippet":
      return Urls.dataStudioSnippet(entity.id);
    case "glossary":
      return Urls.dataStudioGlossary();
    case "pythonlibrary":
      return Urls.transformPythonLibrary({ path: entity.name });
    case "transformtag":
      return Urls.transformList();
    case "card":
    case "collection":
    case "dashboard":
    case "document":
    case "timeline":
    case "transform":
      return Urls.modelToUrl({
        id: entity.id,
        model: entity.model,
        name: entity.name,
        collection_id: entity.collection?.id ?? null,
      });
    default:
      return null;
  }
};

const getGroup = (entity: RemoteSyncEntity): Omit<ChangesGroup, "entities"> => {
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

export const groupChanges = (entities: RemoteSyncEntity[]): ChangesGroup[] => {
  const groups = new Map<string, ChangesGroup>();
  entities.forEach((entity) => {
    const group = getGroup(entity);
    const existing = groups.get(group.key);
    if (existing) {
      existing.entities.push(entity);
    } else {
      groups.set(group.key, { ...group, entities: [entity] });
    }
  });
  return [...groups.values()];
};
