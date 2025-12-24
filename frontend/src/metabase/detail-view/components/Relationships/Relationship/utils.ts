import { parseNumber } from "metabase/lib/number";
import * as Urls from "metabase/lib/urls";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { ForeignKey, RowValue } from "metabase-types/api";

const STAGE_INDEX = 0;

function getForeignKeyFilterClause(field: Lib.ColumnMetadata, rowId: RowValue) {
  if (Lib.isStringOrStringLike(field) && typeof rowId === "string") {
    return Lib.stringFilterClause({
      operator: "=",
      column: field,
      values: [rowId],
      options: {},
    });
  }

  if (Lib.isNumeric(field) && typeof rowId === "string") {
    const number = parseNumber(rowId);
    if (number != null) {
      return Lib.numberFilterClause({
        operator: "=",
        column: field,
        values: [number],
      });
    }
  }

  if (Lib.isNumeric(field) && typeof rowId === "number") {
    return Lib.numberFilterClause({
      operator: "=",
      column: field,
      values: [rowId],
    });
  }

  if (Lib.isBoolean(field) && typeof rowId === "boolean") {
    return Lib.booleanFilterClause({
      operator: "=",
      column: field,
      values: [rowId],
    });
  }
}

export function getForeignKeyQuery(
  fk: ForeignKey,
  rowId: RowValue,
  metadata: Metadata,
) {
  if (fk.origin == null || fk.origin.table == null) {
    return;
  }

  const metadataProvider = Lib.metadataProvider(
    fk.origin.table.db_id,
    metadata,
  );
  const table = Lib.tableOrCardMetadata(metadataProvider, fk.origin.table_id);
  const field = Lib.fieldMetadata(metadataProvider, fk.origin_id);
  if (table == null || field == null) {
    return;
  }

  const filter = getForeignKeyFilterClause(field, rowId);
  if (filter == null) {
    return;
  }

  return Lib.filter(
    Lib.queryFromTableOrCardMetadata(metadataProvider, table),
    STAGE_INDEX,
    filter,
  );
}

export function getForeignKeyCountQuery(fkQuery: Lib.Query) {
  return Lib.aggregateByCount(fkQuery, STAGE_INDEX);
}

export const getForeignKeyQuestionUrl = (query: Lib.Query): string => {
  const question = Question.create({
    dataset_query: Lib.toJsQuery(query),
  });

  return Urls.question(question.card(), { hash: question.card() });
};
