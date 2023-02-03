import { t } from "ttag";
import _ from "underscore";

import { singularize } from "metabase/lib/formatting";

import { DatasetData, Column } from "metabase-types/types/Dataset";
import { isPK, isEntityName } from "metabase-lib/types/utils/isa";
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
}

export const getDisplayId = ({
  cols,
  zoomedRow,
  zoomedRowTableId,
}: GetDisplayIdArgs): ObjectId | null => {
  if (!zoomedRow) {
    return null;
  }

  const columnsFromZoomedTable = cols.filter(col => {
    return col.table_id === parseInt(zoomedRowTableId);
  });

  // console.log("🚀", "columnsFromZoomedTable", columnsFromZoomedTable);

  const hasSinglePK = columnsFromZoomedTable.filter(isPK).length === 1;

  if (hasSinglePK) {
    console.log("🚀", "columnsFromZoomedTable", columnsFromZoomedTable);
    const pkColumn = columnsFromZoomedTable.findIndex(col => {
      // console.log("🚀", "cooool", col);
      return col.table_id === parseInt(zoomedRowTableId) && isPK(col);
    });
    // const pkColumn = columnsFromZoomedTable.findIndex(isPK);
    // console.log("🚀", "zoomedRow", zoomedRow, "pkColumn", pkColumn);
    return zoomedRow[pkColumn] as ObjectId;
  }

  const hasEntityName = cols && !!cols?.find(isEntityName);

  if (hasEntityName) {
    return null;
  }

  // TODO: respect user column reordering
  console.log("🚀", "In getDisplayId", {
    cols,
    columnsFromZoomedTable,
    zoomedRow,
    zoomedRowTableId,
  });
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
