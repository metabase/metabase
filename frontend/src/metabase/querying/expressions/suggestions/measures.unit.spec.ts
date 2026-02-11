import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { SAMPLE_DATABASE } from "metabase-lib/test-helpers";
import {
  createMockField,
  createMockMeasure,
  createMockTable,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { complete } from "./__support__";
import { type Options, suggestMeasures } from "./measures";

describe("suggestMeasures", () => {
  function setup({ expressionMode = "expression" }: Partial<Options>) {
    const DATABASE_ID = SAMPLE_DATABASE.id;
    const TABLE_ID = 1;

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
          name: "sum",
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
    });

    const DATABASE = createSampleDatabase({
      id: DATABASE_ID,
      name: "Database",
      tables: [TABLE],
    });

    const metadata = createMockMetadata({
      databases: [DATABASE],
      tables: [TABLE],
    });

    const metadataProvider = Lib.metadataProvider(DATABASE_ID, metadata);

    const MEASURE_BAR = createMockMeasure({
      name: "BAR",
      table_id: TABLE_ID,
      definition: Lib.createTestQuery(metadataProvider, {
        stages: [
          {
            source: {
              type: "table",
              id: TABLE_ID,
            },
            aggregations: [
              {
                type: "operator",
                operator: "sum",
                args: [{ type: "column", name: "sum", displayName: "Sum" }],
              },
            ],
          },
        ],
      }),
    });

    // Recreate metadata with measure in place
    const metadataProviderWithMeasure = Lib.metadataProvider(
      DATABASE_ID,
      createMockMetadata({
        databases: [DATABASE],
        tables: [TABLE],
        measures: [MEASURE_BAR],
      }),
    );

    const query = Lib.createTestQuery(metadataProviderWithMeasure, {
      stages: [
        {
          source: { type: "table", id: TABLE.id },
        },
      ],
    });

    const source = suggestMeasures({
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

    it("should not suggest measures", () => {
      const complete = setup({ expressionMode });
      const results = complete("Ba|");
      expect(results).toBe(null);
    });
  });

  describe("expressionMode = boolean", () => {
    const expressionMode = "filter";

    it("should not suggest measures", () => {
      const complete = setup({ expressionMode });
      const results = complete("Ba|");
      expect(results).toBe(null);
    });
  });

  describe("expressionMode = aggregations", () => {
    const expressionMode = "aggregation";

    it("should suggest measures", () => {
      const complete = setup({ expressionMode });
      const results = complete("BA|");
      expect(results).toEqual({
        from: 0,
        to: 2,
        options: [
          {
            displayLabel: "BAR",
            icon: "sum",
            label: "[BAR]",
            matches: [[0, 1]],
            type: "measure",
          },
        ],
      });
    });
  });
});
