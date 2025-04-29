import { createMockMetadata } from "__support__/metadata";
import { SAMPLE_DATABASE, createQuery } from "metabase-lib/test-helpers";
import {
  createMockCard,
  createMockField,
  createMockStructuredDatasetQuery,
  createMockTable,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { complete } from "./__support__";
import { type Options, suggestMetrics } from "./metrics";

describe("suggestMetrics", () => {
  function setup({ expressionMode = "expression" }: Partial<Options>) {
    const DATABASE_ID = SAMPLE_DATABASE.id;
    const TABLE_ID = 1;

    const METRIC_FOO = createMockCard({
      name: "FOO",
      type: "metric",
      table_id: TABLE_ID,
      dataset_query: createMockStructuredDatasetQuery({
        database: DATABASE_ID,
        query: {
          "source-table": TABLE_ID,
          aggregation: [["sum", ["field", 11, {}]]],
        },
      }),
    });

    const TABLE = createMockTable({
      db_id: DATABASE_ID,
      id: TABLE_ID,
      fields: [
        createMockField({
          id: 10,
          table_id: TABLE_ID,
          display_name: "Toucan Sam",
          base_type: "type/Float",
        }),
        createMockField({
          id: 11,
          table_id: TABLE_ID,
          display_name: "Sum",
          base_type: "type/Float",
        }),
        createMockField({
          id: 12,
          table_id: TABLE_ID,
          display_name: "count",
          base_type: "type/Float",
        }),
        createMockField({
          id: 13,
          table_id: TABLE_ID,
          display_name: "text",
          base_type: "type/Text",
        }),
        createMockField({
          id: 14,
          table_id: TABLE_ID,
          display_name: "date",
          base_type: "type/DateTime",
        }),
      ],
      metrics: [METRIC_FOO],
    });

    const DATABASE = createSampleDatabase({
      id: DATABASE_ID,
      name: "Database",
      tables: [TABLE],
    });

    const metadata = createMockMetadata({
      databases: [DATABASE],
      tables: [TABLE],
      questions: [METRIC_FOO],
    });

    const query = createQuery({
      metadata,
      query: {
        database: DATABASE.id,
        type: "query",
        query: {
          "source-table": TABLE.id,
        },
      },
    });

    const source = suggestMetrics({
      expressionMode,
      query,
      stageIndex: -1,
    });

    return function (doc: string) {
      return complete(source, doc);
    };
  }

  describe("expressionMode = expression", () => {
    const expressionMode = "expression";

    it("should not suggest metrics", () => {
      const complete = setup({ expressionMode });
      const results = complete("Fo|");
      expect(results).toBe(null);
    });
  });

  describe("expressionMode = boolean", () => {
    const expressionMode = "filter";

    it("should not suggest metrics", () => {
      const complete = setup({ expressionMode });
      const results = complete("Fo|");
      expect(results).toBe(null);
    });
  });

  describe("expressionMode = aggregations", () => {
    const expressionMode = "aggregation";

    it("should suggest metrics", () => {
      const complete = setup({ expressionMode });
      const results = complete("FO|");
      expect(results).toEqual({
        from: 0,
        to: 2,
        options: [
          {
            displayLabel: "FOO",
            icon: "metric",
            label: "[FOO]",
            matches: [[0, 1]],
            type: "metric",
          },
        ],
      });
    });
  });
});
