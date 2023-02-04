import { t } from "ttag";
import _ from "underscore";

import { singularize } from "metabase/lib/formatting";

import { DatasetData, Column } from "metabase-types/types/Dataset";
import { TableId } from "metabase-types/api";
import {
  getIsPKFromTablePredicate,
  isEntityName,
} from "metabase-lib/types/utils/isa";
import Question from "metabase-lib/Question";
import Table from "metabase-lib/metadata/Table";

import { ObjectId } from "./types";

export interface GetObjectNameArgs {
  table: Table | null;
  question: Question;
  cols: Column[];
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
  cols: Column[];
  zoomedRow: unknown[] | undefined;
  tableId?: TableId;
}

export const getDisplayId = ({
  cols,
  zoomedRow,
  tableId,
}: GetDisplayIdArgs): ObjectId | null => {
  const hasSinglePk =
    cols.filter(getIsPKFromTablePredicate(tableId)).length === 1;

  if (!zoomedRow) {
    return null;
  }

  if (hasSinglePk) {
    const pkColumn = cols.findIndex(getIsPKFromTablePredicate(tableId));
    return zoomedRow[pkColumn] as ObjectId;
  }

  const hasEntityName = cols && !!cols?.find(isEntityName);

  if (hasEntityName) {
    return null;
  }

  // TODO: respect user column reordering
  return zoomedRow[0] as ObjectId;
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
