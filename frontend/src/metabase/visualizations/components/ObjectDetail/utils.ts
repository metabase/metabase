import { t } from "ttag";

import { singularize, formatValue } from "metabase/lib/formatting";

import type {
  DatasetColumn,
  DatasetData,
  TableId,
  VisualizationSettings,
} from "metabase-types/api";

import {
  getIsPKFromTablePredicate,
  isEntityName,
  isPK,
} from "metabase-lib/types/utils/isa";
import Question from "metabase-lib/Question";
import Table from "metabase-lib/metadata/Table";

import { ObjectId } from "./types";

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
