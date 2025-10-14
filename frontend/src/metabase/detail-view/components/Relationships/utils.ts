import * as Urls from "metabase/lib/urls";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  ForeignKey,
  RowValue,
  RowValues,
} from "metabase-types/api";

type UrlOpts = {
  columns: DatasetColumn[];
  fk: ForeignKey;
  row: RowValues;
  metadata: Metadata;
};

export const getUrl = ({
  columns,
  row,
  fk,
  metadata,
}: UrlOpts): string | undefined => {
  const pkIndex = columns.findIndex(isPK);
  if (pkIndex === -1) {
    return;
  }

  const objectId = row[pkIndex];
  if (objectId == null) {
    return;
  }

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

  const filter = getFilterClause(field, objectId);
  if (filter == null) {
    return;
  }

  const query = Lib.filter(
    Lib.queryFromTableOrCardMetadata(metadataProvider, table),
    0,
    filter,
  );

  const question = Question.create({
    dataset_query: Lib.toJsQuery(query),
  });

  return Urls.question(question.card(), { hash: question.card() });
};

function getFilterClause(field: Lib.ColumnMetadata, objectId: RowValue) {
  switch (typeof objectId) {
    case "string":
      return Lib.stringFilterClause({
        operator: "=",
        column: field,
        values: [objectId],
        options: {},
      });
    case "number":
      return Lib.numberFilterClause({
        operator: "=",
        column: field,
        values: [objectId],
      });
    case "boolean":
      return Lib.booleanFilterClause({
        operator: "=",
        column: field,
        values: [objectId],
      });
    default:
      return undefined;
  }
}
