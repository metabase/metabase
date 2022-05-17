import { t } from "ttag";
import _ from "underscore";

import { singularize } from "metabase/lib/formatting";
import { isPK, isEntityName } from "metabase/lib/schema_metadata";
import { Table } from "metabase-types/types/Table";

import Question from "metabase-lib/lib/Question";
import { DatasetData, Column } from "metabase-types/types/Dataset";

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
}

export const getDisplayId = ({
  cols,
  zoomedRow,
}: GetDisplayIdArgs): ObjectId | null => {
  const hasSinglePk =
    cols.reduce(
      (pks: number, col: Column) => (isPK(col) ? pks + 1 : pks),
      0,
    ) === 1;

  if (!zoomedRow) {
    return null;
  }

  if (hasSinglePk) {
    const pkColumn = cols.findIndex(isPK);
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
  zoomedRowID?: ObjectId;
}

export const getIdValue = ({
  data,
  zoomedRowID,
}: GetIdValueArgs): ObjectId | null => {
  if (!data) {
    return null;
  }
  if (zoomedRowID) {
    return zoomedRowID;
  }

  const { cols, rows } = data;
  const columnIndex = _.findIndex(cols, col => isPK(col));
  return rows[0][columnIndex] as number;
};

export function getSingleResultsRow(data: DatasetData) {
  return data.rows.length === 1 ? data.rows[0] : null;
}
