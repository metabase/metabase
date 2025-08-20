import { t } from "ttag";

import {
  isImplicitDeleteAction,
  isImplicitUpdateAction,
} from "metabase/actions/utils";
import { hasActionsEnabled } from "metabase/admin/databases/utils";
import type { Database, WritebackAction } from "metabase-types/api";

export const getActionItems = ({
  actions,
  databases,
  onDelete,
  onUpdate,
}: {
  actions: WritebackAction[];
  databases: Database[];
  onDelete: (action: WritebackAction) => void;
  onUpdate: (action: WritebackAction) => void;
}) => {
  const actionItems = [];
  const privateActions = actions.filter((action) => !action.public_uuid);
  const deleteAction = privateActions.find(isValidImplicitDeleteAction);
  const updateAction = privateActions.find(isValidImplicitUpdateAction);

  if (updateAction && canRunAction(updateAction, databases)) {
    const action = () => onUpdate(updateAction);
    actionItems.push({ title: t`Update`, icon: "pencil", action });
  }

  if (deleteAction && canRunAction(deleteAction, databases)) {
    const action = () => onDelete(deleteAction);
    actionItems.push({ title: t`Delete`, icon: "trash", action });
  }

  return actionItems;
};

export const isValidImplicitDeleteAction = (action: WritebackAction): boolean =>
  isImplicitDeleteAction(action) && !action.archived;

export const isValidImplicitUpdateAction = (action: WritebackAction): boolean =>
  isImplicitUpdateAction(action) && !action.archived;

export const canRunAction = (
  action: WritebackAction,
  databases: Database[],
) => {
  const database = databases.find(({ id }) => id === action.database_id);
  return database != null && hasActionsEnabled(database);
};
