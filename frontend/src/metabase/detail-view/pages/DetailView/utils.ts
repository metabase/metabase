import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { isNumeric, isPK } from "metabase-lib/v1/types/utils/isa";
import type { StructuredDatasetQuery, Table } from "metabase-types/api";

export function getTableQuery(
  table: Table,
): StructuredDatasetQuery | undefined {
  return {
    database: table.db_id,
    query: {
      "source-table": table.id,
    },
    type: "query",
  };
}

export function getObjectQuery(
  table: Table,
  objectId: string | number,
): StructuredDatasetQuery | undefined {
  const pk = (table.fields ?? []).find(isPK);

  if (!pk) {
    return getTableQuery(table);
  }

  return {
    database: table.db_id,
    query: {
      "source-table": table.id,
      filter: [
        "=",
        [
          "field",
          getRawTableFieldId(pk),
          {
            "base-type": pk.base_type,
          },
        ],
        isNumeric(pk) && typeof objectId === "string"
          ? parseFloat(objectId)
          : objectId,
      ],
    },
    type: "query",
  };
}
