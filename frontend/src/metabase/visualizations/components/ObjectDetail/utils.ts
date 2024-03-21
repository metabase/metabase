import { t } from "ttag";

import {
  isImplicitDeleteAction,
  isImplicitUpdateAction,
} from "metabase/actions/utils";
import { singularize, formatValue } from "metabase/lib/formatting";
import type Question from "metabase-lib/v1/Question";
import { canRunAction } from "metabase-lib/v1/actions/utils";
import type Database from "metabase-lib/v1/metadata/Database";
import type Table from "metabase-lib/v1/metadata/Table";
import {
  getIsPKFromTablePredicate,
  isEntityName,
  isPK,
} from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  DatasetData,
  TableId,
  VisualizationSettings,
  WritebackAction,
} from "metabase-types/api";

import type { ObjectId } from "./types";

export interface GetObjectNameArgs {
  table?: Table | null;
  question?: Question;
  cols: DatasetColumn[];
  zoomedRow: unknown[] | undefined;
}

export const getObjectName = ({
  table,
  question,
  cols,
  zoomedRow,
}: GetObjectNameArgs): string => {
  const entityNameColumn = cols && cols?.findIndex(isEntityName);

  if (zoomedRow?.length && zoomedRow[entityNameColumn]) {
    return zoomedRow[entityNameColumn] as string;
  }

  const tableObjectName = table && table.objectName();
  if (tableObjectName) {
    return tableObjectName;
  }
  const questionName = question && question.displayName();
  if (questionName) {
    return singularize(questionName);
  }
  return t`Item Detail`;
};

export interface GetDisplayIdArgs {
  cols: DatasetColumn[];
  zoomedRow: unknown[] | undefined;
  tableId?: TableId;
  settings: VisualizationSettings;
}

export const getDisplayId = ({
  cols,
  zoomedRow,
  tableId,
  settings,
}: GetDisplayIdArgs): ObjectId | null => {
  const hasSinglePk =
    cols.filter(getIsPKFromTablePredicate(tableId)).length === 1;

  if (!zoomedRow) {
    return null;
  }

  if (hasSinglePk) {
    const pkColumnIndex = cols.findIndex(getIsPKFromTablePredicate(tableId));
    const pkColumn = cols[pkColumnIndex];
    const columnSetting = settings?.column?.(pkColumn) ?? {};

    return formatValue(zoomedRow[pkColumnIndex], {
      ...columnSetting,
      column: pkColumn,
    }) as ObjectId;
  }

  const hasEntityName = cols && !!cols?.find(isEntityName);

  if (hasEntityName) {
    return null;
  }

  // TODO: respect user column reordering
  const defaultColumn = cols[0];
  const columnSetting = settings?.column?.(defaultColumn) ?? {};

  return formatValue(zoomedRow[0], {
    ...columnSetting,
    column: defaultColumn,
  }) as ObjectId;
};

export interface GetIdValueArgs {
  data: DatasetData;
  tableId?: TableId;
}

export const getIdValue = ({
  data,
  tableId,
}: GetIdValueArgs): ObjectId | null => {
  if (!data) {
    return null;
  }

  const { cols, rows } = data;
  const columnIndex = cols.findIndex(getIsPKFromTablePredicate(tableId));
  return rows[0][columnIndex] as number;
};

export function getSingleResultsRow(data: DatasetData) {
  return data.rows.length === 1 ? data.rows[0] : null;
}

export const getSinglePKIndex = (cols: DatasetColumn[]) => {
  const pkCount = cols?.filter(isPK)?.length;
  if (pkCount !== 1) {
    return undefined;
  }
  const index = cols?.findIndex(isPK);

  return index === -1 ? undefined : index;
};

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
  /**
   * Public actions require an additional endpoint which is out of scope
   * of Milestone 1 in #32320 epic.
   *
   * @see https://github.com/metabase/metabase/issues/32320
   * @see https://metaboat.slack.com/archives/C057T1QTB3L/p1689845931726009?thread_ts=1689665950.493399&cid=C057T1QTB3L
   */
  const privateActions = actions.filter(action => !action.public_uuid);
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
