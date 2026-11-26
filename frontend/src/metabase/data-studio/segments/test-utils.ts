import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { DatasetQuery, FieldId, TableId } from "metabase-types/api";

type SegmentFilterDefinitionOpts = {
  tableId: TableId;
  fieldId: FieldId;
  operator: "<" | ">";
  value: number;
};

/**
 * A segment definition on a sample database table with one comparison filter,
 * in the MBQL 5 shape the segment endpoints send.
 */
export function createSegmentFilterDefinition({
  tableId,
  fieldId,
  operator,
  value,
}: SegmentFilterDefinitionOpts): DatasetQuery {
  return Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: tableId },
        filters: [
          {
            type: "operator",
            operator,
            args: [
              { type: "column", fieldId },
              { type: "literal", value },
            ],
          },
        ],
      },
    ],
  });
}
