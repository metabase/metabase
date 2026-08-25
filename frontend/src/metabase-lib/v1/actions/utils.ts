import type Question from "metabase-lib/v1/Question";
import type { Database, WritebackAction } from "metabase-types/api";

export const canRunAction = (
  action: WritebackAction,
  databases: Pick<Database, "id" | "settings">[],
) => {
  const database = databases.find(({ id }) => id === action.database_id);
  return Boolean(database?.settings?.["database-enable-actions"]);
};

export const canEditAction = (action: WritebackAction, model: Question) => {
  if (action.model_id !== model.id()) {
    return false;
  }

  return model.canWriteActions();
};

export const canArchiveAction = (action: WritebackAction, model: Question) => {
  if (action.model_id !== model.id()) {
    return false;
  }

  return action.type !== "implicit" && canEditAction(action, model);
};
