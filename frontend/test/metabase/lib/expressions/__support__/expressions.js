import { makeMetadata } from "__support__/sample_database_fixture";
import { TYPE } from "metabase-lib/types/constants";

const metadata = makeMetadata({
  databases: {
    1: {
      name: "db",
      tables: [1],
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
    },
  },
  tables: {
    1: {
      db: 1,
      fields: [1, 2, 3, 10, 11, 12, 13, 14],
    },
  },
  fields: {
    1: {
      id: 1,
      table_id: 1,
      table: 1,
      display_name: "A",
      base_type: TYPE.Float,
    },
    2: {
      id: 2,
      table_id: 1,
      table: 1,
      display_name: "B",
      base_type: TYPE.Float,
    },
    3: {
      id: 3,
      table_id: 1,
      table: 1,
      display_name: "C",
      base_type: TYPE.Float,
    },
    10: {
      id: 10,
      table_id: 1,
      table: 1,
      display_name: "Toucan Sam",
      base_type: TYPE.Float,
    },
    11: {
      id: 11,
      table_id: 1,
      table: 1,
      display_name: "Sum",
      base_type: TYPE.Float,
    },
    12: {
      id: 12,
      table_id: 1,
      table: 1,
      display_name: "count",
      base_type: TYPE.Float,
    },
    13: {
      id: 13,
      table_id: 1,
      table: 1,
      display_name: "text",
      base_type: TYPE.Text,
    },
    14: {
      id: 14,
      table_id: 1,
      table: 1,
      display_name: "date",
      base_type: TYPE.DateTime,
    },
  },
});

export const query = metadata.table(1).query();
export const expressionOpts = { query, startRule: "expression" };
export const aggregationOpts = { query, startRule: "aggregation" };
export const filterOpts = { query, startRule: "boolean" };
