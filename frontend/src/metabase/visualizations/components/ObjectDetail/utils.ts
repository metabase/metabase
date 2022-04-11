import { singularize } from "metabase/lib/formatting";

import { t } from "ttag";
import { isPK } from "metabase/lib/schema_metadata";
import _ from "underscore";
import { Table } from "metabase-types/types/Table";
import Question from "metabase-lib/lib/Question";
import { DatasetData } from "metabase-types/types/Dataset";
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
  zoomedRowID: number;
}

export const getIdValue = ({
  data,
  zoomedRowID,
}: GetIdValueArgs): number | null => {
  if (!data) {
    return null;
  }
  if (zoomedRowID) {
    return zoomedRowID;
  }

  const { cols, rows } = data;
  const columnIndex = _.findIndex(cols, col => isPK(col));
  return rows[0][columnIndex];
};
