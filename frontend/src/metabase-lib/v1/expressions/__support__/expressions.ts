import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import { SAMPLE_DATABASE } from "metabase-lib/test-helpers";
import { TYPE } from "metabase-lib/v1/types/constants";
import type { DatasetQuery } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockMetric,
  createMockSegment,
  createMockTable,
} from "metabase-types/api/mocks";
import { SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

const DB_ID = SAMPLE_DB_ID;
const TABLE_ID = 1;

export const DEFAULT_QUERY: DatasetQuery = {
  database: SAMPLE_DATABASE.id,
  type: "query",
  query: {
    "source-table": TABLE_ID,
  },
};

const database = createMockDatabase({
  id: SAMPLE_DB_ID,
  name: "db",
  tables: [
    createMockTable({
      db_id: DB_ID,
      id: TABLE_ID,
      fields: [
        createMockField({
          id: 1,
          table_id: TABLE_ID,
          display_name: "A",
          base_type: TYPE.Float,
        }),
        createMockField({
          id: 2,
          table_id: TABLE_ID,
          display_name: "B",
          base_type: TYPE.Float,
        }),
        createMockField({
          id: 3,
          table_id: TABLE_ID,
          display_name: "C",
          base_type: TYPE.Float,
        }),
        createMockField({
          id: 10,
          table_id: TABLE_ID,
          display_name: "Toucan Sam",
          base_type: TYPE.Float,
        }),
        createMockField({
          id: 11,
          table_id: TABLE_ID,
          display_name: "Sum",
          base_type: TYPE.Float,
        }),
        createMockField({
          id: 12,
          table_id: TABLE_ID,
          display_name: "count",
          base_type: TYPE.Float,
        }),
        createMockField({
          id: 13,
          table_id: TABLE_ID,
          display_name: "text",
          base_type: TYPE.Text,
        }),
        createMockField({
          id: 14,
          table_id: TABLE_ID,
          display_name: "date",
          base_type: TYPE.DateTime,
        }),
      ],
      segments: [
        createMockSegment({
          id: 1,
          name: "segment",
          table_id: TABLE_ID,
        }),
      ],
      metrics: [
        createMockMetric({
          id: 1,
          name: "metric",
          table_id: TABLE_ID,
        }),
        createMockMetric({
          id: 2,
          name: "metric",
          table_id: TABLE_ID,
        }),
      ],
    }),
  ],
  features: [
    "basic-aggregations",
    "standard-deviation-aggregations",
    "expression-aggregations",
    "percentile-aggregations",
    "foreign-keys",
    "native-parameters",
    "expressions",
    "advanced-math-expressions",
    "right-join",
    "left-join",
    "inner-join",
    "nested-queries",
  ],
});

export const metadata = createMockMetadata({
  databases: [database],
});

export const legacyQuery = checkNotNull(metadata.table(TABLE_ID)).legacyQuery({
  useStructuredQuery: true,
});
export const expressionOpts = { legacyQuery, startRule: "expression" };
export const aggregationOpts = { legacyQuery, startRule: "aggregation" };
