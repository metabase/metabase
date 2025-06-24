import type {
  ActionItem,
  CollectionItem,
  DatabaseItem,
  ModelItem,
  SchemaItem,
  TableItem,
  TablePickerValue,
} from "metabase/common/components/DataPicker";
import type {
  CardId,
  CollectionId,
  DataGridWritebackActionId,
  DatabaseId,
  DatabaseWithActionsItem,
  ListActionItem,
  ModelWithActionsItem,
  TableId,
  TableWithActionsItem,
} from "metabase-types/api";

import type {
  CollectionListItem,
  ModelActionPickerItem,
  TableActionPickerItem,
} from "./types";

export const generateTableActionKey = (
  dbItem: DatabaseItem | null,
  schemaItem: SchemaItem | null,
  tableItem: TableItem | null,
  actionItem: ActionItem | null,
) => {
  return [dbItem?.id, schemaItem?.id, tableItem?.id, actionItem?.id].join("-");
};

export const generateModelActionKey = (
  modelItem: ModelItem | null,
  actionItem: ActionItem | null,
) => {
  return [modelItem?.id, actionItem?.id].join("-");
};

export const getActionItem = (
  actions: ListActionItem[] | undefined,
  actionId: DataGridWritebackActionId | undefined,
): ActionItem | null => {
  if (typeof actionId === "undefined") {
    return null;
  }

  const action = actions?.find(({ id }) => id === actionId);
  const name = action?.name ?? "";

  return { model: "action", id: actionId, name };
};

export const isActionItem = (
  value: TableActionPickerItem | ModelActionPickerItem | undefined,
): value is ActionItem => {
  return value?.model === "action";
};

export const getModelItem = (
  modelItems: ModelWithActionsItem[] | undefined,
  modelId: CardId | undefined,
): ModelItem | null => {
  if (typeof modelId === "undefined") {
    return null;
  }

  const item = modelItems?.find(({ id }) => id === modelId);
  const name = item?.name ?? "";

  return { model: "dataset", id: modelId, name };
};

export const getCollectionItem = (
  collectionItems: CollectionListItem[] | undefined,
  collectionId: CollectionId | undefined,
): CollectionItem | null => {
  if (typeof collectionId === "undefined") {
    return null;
  }

  const item = collectionItems?.find(({ id }) => id === collectionId);
  const name = item?.name ?? "";

  return { model: "collection", id: collectionId, name };
};

export const isModelItem = (
  value: TableActionPickerItem | ModelActionPickerItem | undefined,
): value is ModelItem => {
  return value?.model === "dataset";
};

export const isTableItem = (
  value: TableActionPickerItem | ModelActionPickerItem | undefined,
): value is TablePickerValue => {
  return value?.model === "table";
};

export const getDbItem = (
  databases: DatabaseWithActionsItem[] | undefined,
  dbId: DatabaseId | undefined,
): DatabaseItem | null => {
  if (typeof dbId === "undefined") {
    return null;
  }

  const database = databases?.find((db) => db.id === dbId);
  const name = database?.name ?? "";

  return { model: "database", id: dbId, name };
};

export const getTableItem = (
  tables: TableWithActionsItem[] | undefined,
  tableId: TableId | undefined,
): TableItem | null => {
  if (typeof tableId === "undefined") {
    return null;
  }

  const table = tables?.find((table) => table.id === tableId);
  const name = table?.name ?? "";

  return { model: "table", id: tableId, name };
};
