import type {
  ActionItem,
  DatabaseItem,
  ModelActionPickerItem,
  ModelItem,
  SchemaItem,
  TableActionPickerItem,
  TableItem,
} from "metabase/common/components/DataPicker";
import type {
  Card,
  CardId,
  DataGridWritebackAction,
  DataGridWritebackActionId,
} from "metabase-types/api";

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
  models: Card[] | undefined,
  modelId: CardId | undefined,
): ModelItem | null => {
  if (typeof modelId === "undefined") {
    return null;
  }

  const table = models?.find((model) => model.id === modelId);
  const name = table?.name ?? "";

  return { model: "dataset", id: modelId, name };
};
