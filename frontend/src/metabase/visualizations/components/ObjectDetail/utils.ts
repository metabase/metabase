import { t } from "ttag";
import _ from "underscore";

import { singularize } from "metabase/lib/formatting";
import { isPK } from "metabase/lib/schema_metadata";
import { Table } from "metabase-types/types/Table";
import Question from "metabase-lib/lib/Question";
import { DatasetData } from "metabase-types/types/Dataset";

import { ObjectId } from "./types";

export interface GetObjectNameArgs {
  table: Table | null;
  question: Question;
}

export const getObjectName = ({
  table,
  question,
}: GetObjectNameArgs): string => {
  const tableObjectName = table && table.objectName();
  if (tableObjectName) {
    return tableObjectName;
  }
  const questionName = question && question.displayName();
  if (questionName) {
    return singularize(questionName);
  }
  return t`Unknown`;
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
