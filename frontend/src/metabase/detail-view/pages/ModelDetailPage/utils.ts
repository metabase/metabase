import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { isNumeric, isPK } from "metabase-lib/v1/types/utils/isa";
import type { StructuredDatasetQuery, Table } from "metabase-types/api";

export function getObjectQuery(
  table: Table,
  objectId: string | number,
): StructuredDatasetQuery | undefined {
  const pks = (table.fields ?? []).filter(isPK);

  if (pks.length === 0) {
    throw new Error("Table has no primary keys");
  }

  if (pks.length > 1) {
    throw new Error("Table has multiple primary keys");
  }

  const [pk] = pks;

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
