import type {
  ActionItem,
  ActionPickerValue,
} from "metabase/common/components/DataPicker";
import type {
  DataGridWritebackAction,
  DataGridWritebackActionId,
} from "metabase-types/api";

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
  value: ActionItem | undefined,
): value is ActionPickerValue => {
  return value?.model === "action";
};
