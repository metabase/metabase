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
  function setup({ startRule = "expression" }: Partial<Options>) {
    const DATABASE_ID = SAMPLE_DATABASE.id;
    const TABLE_ID = 1;

    const METRIC_FOO = createMockCard({
      name: "FOO",
      type: "metric",
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
      startRule,
      query,
      stageIndex: -1,
    });

    return function (doc: string) {
      return complete(source, doc);
    };
  }

  describe("startRule = expression", () => {
    const startRule = "expression";

    it("should not suggest metrics", () => {
      const complete = setup({ startRule });
      const results = complete("Fo|");
      expect(results).toBe(null);
    });
  });

  describe("startRule = boolean", () => {
    const startRule = "boolean";

    it("should not suggest metrics", () => {
      const complete = setup({ startRule });
      const results = complete("Fo|");
      expect(results).toBe(null);
    });
  });

  describe("startRule = aggregations", () => {
    const startRule = "aggregations";

    // TODO: I cannot get metrics to work
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should suggest metrics", () => {
      const complete = setup({ startRule });
      const results = complete("Fo|");
      expect(results).toBe({
        from: 0,
        options: [],
      });
    });
  });
});
