import { question } from "metabase/lib/urls";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  ForeignKey,
  RowValues,
  Table,
} from "metabase-types/api";

export const getUrl = ({
  columns,
  row,
  table,
  fk,
}: {
  columns: DatasetColumn[];
  fk: ForeignKey;
  row: RowValues;
  table: Table;
}): string | undefined => {
  const pkIndex = columns.findIndex(isPK);

  if (pkIndex === -1) {
    return undefined;
  }

  const objectId = row[pkIndex];

  if (objectId == null) {
    return undefined;
  }

  if (fk.origin?.table_id) {
    const card = {
      type: "question" as const,
      dataset_query: {
        type: "query" as const,
        query: {
          "source-table": fk.origin.table_id,
          filter: ["=", ["field", fk.origin.id, null], objectId],
        },
        database: fk.origin.table?.db_id || table.db_id,
      },
    };

    const questionUrl = question(card, { hash: card as any });
    return questionUrl;
  }

  return undefined;
};
