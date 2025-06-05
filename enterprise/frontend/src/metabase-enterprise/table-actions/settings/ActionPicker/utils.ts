import type {
  ActionItem,
  CollectionItem,
  DatabaseItem,
  ModelActionPickerItem,
  ModelItem,
  SchemaItem,
  TableActionPickerItem,
  TableItem,
} from "metabase/common/components/DataPicker";
import type {
  ActionV2ListModelItem,
  CardId,
  CollectionId,
  DataGridWritebackAction,
  DataGridWritebackActionId,
} from "metabase-types/api";

import type { CollectionListItem } from "./types";

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
  actions: DataGridWritebackAction[] | undefined,
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
  modelItems: ActionV2ListModelItem[] | undefined,
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
