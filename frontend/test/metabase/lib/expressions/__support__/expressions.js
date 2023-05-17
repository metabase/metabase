import {
  createMockDatabase,
  createMockField,
  createMockMetric,
  createMockSegment,
  createMockTable,
} from "metabase-types/api/mocks";
import { createMockMetadata } from "__support__/metadata";
import { TYPE } from "metabase-lib/types/constants";

const DB_ID = 1;
const TABLE_ID = 1;

const metadata = createMockMetadata({
  databases: [
    createMockDatabase({
      id: DB_ID,
      name: "db",
      tables: [
        createMockTable({
          db: DB_ID,
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
            }),
          ],
          metrics: [
            createMockMetric({
              id: 1,
              name: "metric",
            }),
            createMockMetric({
              id: 2,
              name: "metric",
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
        "advanced-math-expressions",
      ],
    }),
  ],
});

export const query = metadata.table(TABLE_ID).query();
export const expressionOpts = { query, startRule: "expression" };
export const aggregationOpts = { query, startRule: "aggregation" };
