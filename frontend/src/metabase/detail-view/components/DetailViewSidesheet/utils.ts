import { t } from "ttag";

import {
  isImplicitDeleteAction,
  isImplicitUpdateAction,
} from "metabase/actions/utils";
import { hasActionsEnabled } from "metabase/admin/databases/utils";
import { extractRemappedColumns } from "metabase/visualizations";
import { getQuestionIdFromVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import { findColumnIndexesForColumnSettings } from "metabase-lib/v1/queries/utils/dataset";
import type {
  Database,
  Dataset,
  DatasetColumn,
  RowValues,
  Table,
  TableColumnOrderSetting,
  WritebackAction,
} from "metabase-types/api";

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

export function extractData(
  dataset: Dataset | undefined,
  columnsFromProp: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[] | undefined,
  rowFromProps: RowValues | undefined,
) {
  const data = dataset ? extractRemappedColumns(dataset.data) : undefined;
  const unsortedColumns = data?.cols ?? columnsFromProp;
  const columnIndexes = columnSettings
    ? findColumnIndexesForColumnSettings(
        unsortedColumns,
        columnSettings.filter(({ enabled }) => enabled),
      ).filter((columnIndex: number) => columnIndex >= 0)
    : unsortedColumns.map((_value, index) => index);
  const columns = columnIndexes.map((index) => unsortedColumns[index]);
  const rowFromQuery = (data?.rows ?? [])[0];
  const unsortedRow = rowFromProps ?? rowFromQuery;
  const row = unsortedRow
    ? columnIndexes.map((index) => unsortedRow[index])
    : undefined;

  return { columns, row };
}

export function getModelId(table: Table | undefined) {
  return table?.type === "model"
    ? getQuestionIdFromVirtualTableId(table.id)
    : undefined;
}
