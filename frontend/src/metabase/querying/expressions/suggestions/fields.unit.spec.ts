import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";
import { ORDERS_ID, REVIEWS_ID } from "metabase-types/api/mocks/presets";

import { columnsForExpressionMode } from "../mode";
import { queryWithAggregation, sharedProvider } from "../test/shared";

import { complete } from "./__support__";
import { suggestFields } from "./fields";

describe("suggestFields", () => {
  function setup() {
    const NAME = createMockField({
      id: 1,
      name: "NAME",
      display_name: "Name",
      base_type: "type/String",
    });

    const EMAIL = createMockField({
      id: 2,
      name: "EMAIL",
      display_name: "Email",
      semantic_type: "type/Email",
      base_type: "type/String",
    });

    const SEATS = createMockField({
      id: 3,
      name: "SEATS",
      display_name: "Seats",
      base_type: "type/Integer",
    });

    const TABLE = createMockTable({
      fields: [NAME, EMAIL, SEATS],
    });

    const DATABASE = createMockDatabase({
      tables: [TABLE],
    });

    const metadata = createMockMetadata({ databases: [DATABASE] });
    const provider = createMetadataProvider({
      databaseId: DATABASE.id,
      metadata,
    });

    const query = Lib.createTestQuery(provider, {
      stages: [{ source: { type: "table", id: TABLE.id } }],
    });

    const stageIndex = 0;
    const expressionIndex = 0;
    const source = suggestFields({
      query,
      stageIndex,
      availableColumns: columnsForExpressionMode({
        query,
        stageIndex,
        expressionMode: "expression",
        expressionIndex,
      }),
    });

    return function (doc: string) {
      return complete(source, doc);
    };
  }

  const RESULTS = {
    from: 0,
    to: 3,
    options: [
      {
        label: "[Email]",
        displayLabel: "Email",
        matches: [[0, 2]],
        type: "field",
        icon: "list",
        column: expect.any(Object),
      },
      {
        label: "[Seats]",
        displayLabel: "Seats",
        matches: [[1, 2]],
        type: "field",
        icon: "int",
        column: expect.any(Object),
      },
    ],
  };

  const ALL_RESULTS = {
    from: 0,
    to: 1,
    filter: false,
    options: [
      {
        label: "[Email]",
        displayLabel: "Email",
        type: "field",
        icon: "list",
        column: expect.any(Object),
      },
      {
        label: "[Name]",
        displayLabel: "Name",
        type: "field",
        icon: "list",
        column: expect.any(Object),
      },
      {
        label: "[Seats]",
        displayLabel: "Seats",
        type: "field",
        icon: "int",
        column: expect.any(Object),
      },
    ],
  };

  it("should suggest fields", () => {
    const complete = setup();
    const results = complete("Ema|");
    expect(results).toEqual(RESULTS);
  });

  it("should suggest fields, inside a word", () => {
    const complete = setup();
    const results = complete("Em|a");
    expect(results).toEqual(RESULTS);
  });

  it("should suggest fields when typing [", () => {
    const complete = setup();
    const results = complete("[|");
    expect(results).toEqual(ALL_RESULTS);
  });

  it("should suggest fields when inside []", () => {
    const complete = setup();
    const results = complete("[|]");
    expect(results).toEqual({ ...ALL_RESULTS, to: 2 });
  });

  it("should suggest fields in an open [", () => {
    const complete = setup();
    const results = complete("[Ema|");
    expect(results).toEqual({ ...RESULTS, to: 4 });
  });

  it("should suggest fields in an open [, inside a word", () => {
    const complete = setup();
    const results = complete("[Em|a");
    expect(results).toEqual({ ...RESULTS, to: 4 });
  });

  it("should suggest fields inside []", () => {
    const complete = setup();
    const results = complete("[Ema|]");
    expect(results).toEqual({ ...RESULTS, to: 5 });
  });

  it("should suggest fields in [], inside a word", () => {
    const complete = setup();
    const results = complete("[Em|a]");
    expect(results).toEqual({ ...RESULTS, to: 5 });
  });

  it("should suggest foreign fields", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const stageIndex = -1;
    const source = suggestFields({
      query,
      stageIndex,
      availableColumns: columnsForExpressionMode({
        query,
        stageIndex,
        expressionMode: "expression",
      }),
    });

    const result = complete(source, "[Use|");

    expect(result).toEqual({
      from: 0,
      to: 4,
      options: [
        {
          type: "field",
          label: "[User ID]",
          displayLabel: "User ID",
          icon: "connections",
          column: expect.any(Object),
          matches: [[0, 2]],
        },
        {
          type: "field",
          label: "[User → Address]",
          displayLabel: "User → Address",
          icon: "string",
          column: expect.any(Object),
          matches: [[0, 2]],
        },
        {
          type: "field",
          label: "[User → City]",
          displayLabel: "User → City",
          icon: "location",
          column: expect.any(Object),
          matches: [[0, 2]],
        },
        {
          type: "field",
          label: "[User → Email]",
          displayLabel: "User → Email",
          icon: "string",
          column: expect.any(Object),
          matches: [[0, 2]],
        },
        {
          type: "field",
          label: "[User → ID]",
          displayLabel: "User → ID",
          icon: "label",
          column: expect.any(Object),
          matches: [[0, 2]],
        },
        {
          type: "field",
          label: "[User → Latitude]",
          displayLabel: "User → Latitude",
          icon: "location",
          column: expect.any(Object),
          matches: [[0, 2]],
        },
        {
          type: "field",
          label: "[User → Longitude]",
          displayLabel: "User → Longitude",
          icon: "location",
          column: expect.any(Object),
          matches: [[0, 2]],
        },
        {
          type: "field",
          label: "[User → Name]",
          displayLabel: "User → Name",
          icon: "string",
          column: expect.any(Object),
          matches: [[0, 2]],
        },
        {
          type: "field",
          label: "[User → Password]",
          displayLabel: "User → Password",
          icon: "string",
          column: expect.any(Object),
          matches: [[0, 2]],
        },
        {
          type: "field",
          label: "[User → Source]",
          displayLabel: "User → Source",
          icon: "string",
          column: expect.any(Object),
          matches: [[0, 2]],
        },
        {
          type: "field",
          label: "[User → State]",
          displayLabel: "User → State",
          icon: "location",
          column: expect.any(Object),
          matches: [[0, 2]],
        },
        {
          type: "field",
          label: "[User → Zip]",
          displayLabel: "User → Zip",
          icon: "location",
          column: expect.any(Object),
          matches: [[0, 2]],
        },
        {
          type: "field",
          label: "[User → Birth Date]",
          displayLabel: "User → Birth Date",
          icon: "calendar",
          column: expect.any(Object),
          matches: [[0, 2]],
        },
        {
          type: "field",
          label: "[User → Created At]",
          displayLabel: "User → Created At",
          icon: "calendar",
          column: expect.any(Object),
          matches: [[0, 2]],
        },
      ],
    });
  });

  it("should suggest joined fields", async () => {
    const query = Lib.createTestQuery(sharedProvider, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          joins: [
            {
              source: { type: "table", id: REVIEWS_ID },
              strategy: "left-join",
              conditions: [
                {
                  operator: "=",
                  left: {
                    type: "column",
                    sourceName: "ORDERS",
                    name: "PRODUCT_ID",
                  },
                  right: {
                    type: "column",
                    sourceName: "REVIEWS",
                    name: "PRODUCT_ID",
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    const stageIndex = -1;
    const source = suggestFields({
      query,
      stageIndex,
      availableColumns: columnsForExpressionMode({
        query,
        stageIndex,
        expressionMode: "expression",
      }),
    });

    const result = await complete(source, "Body|");

    expect(result).toEqual({
      from: 0,
      to: 4,
      options: expect.any(Array),
    });

    expect(result?.options[0]).toEqual({
      displayLabel: "Reviews - Product → Body",
      label: "[Reviews - Product → Body]",
      type: "field",
      icon: "string",
      column: expect.any(Object),
      matches: [
        [12, 13],
        [20, 23],
      ],
    });
    expect(result?.options[1]).toEqual({
      displayLabel: "Product ID",
      label: "[Product ID]",
      type: "field",
      icon: "connections",
      column: expect.any(Object),
      matches: [
        [2, 3],
        [9, 9],
      ],
    });
  });

  it("should suggest nested query fields", () => {
    const queryWithAggregation = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [
            {
              type: "operator",
              operator: "count",
            },
          ],
          breakouts: [
            {
              type: "column",
              sourceName: "ORDERS",
              name: "TOTAL",
            },
          ],
        },
      ],
    });

    const query = Lib.appendStage(queryWithAggregation);
    const stageIndexAfterNesting = 1;

    const source = suggestFields({
      query,
      stageIndex: stageIndexAfterNesting,
      availableColumns: columnsForExpressionMode({
        query,
        stageIndex: stageIndexAfterNesting,
        expressionMode: "expression",
      }),
    });

    const result = complete(source, "T|");
    expect(result).toEqual({
      from: 0,
      to: 1,
      options: [
        {
          type: "field",
          label: "[Total]",
          displayLabel: "Total",
          icon: "int",
          column: expect.any(Object),
          matches: [
            [0, 0],
            [2, 2],
          ],
        },
        {
          type: "field",
          label: "[Count]",
          displayLabel: "Count",
          icon: "int",
          column: expect.any(Object),
          matches: [[4, 4]],
        },
      ],
    });
  });

  it.each(["expression", "filter"] as const)(
    "should not suggest aggregations when expressionMode = %s",
    async (expressionMode) => {
      const query = queryWithAggregation;
      const stageIndex = -1;

      const source = suggestFields({
        query,
        stageIndex,
        availableColumns: columnsForExpressionMode({
          query,
          stageIndex,
          expressionMode,
        }),
      });

      const result = await complete(source, "[Bar aggregat|]");
      const aggregations = result?.options.filter(
        (option) => option.displayLabel === "Bar Aggregation",
      );
      expect(aggregations).toHaveLength(0);
    },
  );

  it("should suggest aggregations when expressionMode = aggregation", async () => {
    const query = queryWithAggregation;
    const stageIndex = -1;
    const source = suggestFields({
      query,
      stageIndex,
      availableColumns: columnsForExpressionMode({
        query,
        stageIndex,
        expressionMode: "aggregation",
      }),
    });

    const result = await complete(source, "[Bar aggregat|]");
    const aggregations = result?.options.filter(
      (option) => option.displayLabel === "Bar Aggregation",
    );
    expect(aggregations).toHaveLength(1);
  });

  it.each(["expression", "filter", "aggregation"] as const)(
    "should suggest aggregations when expressionMode = %s in later stages",
    async (expressionMode) => {
      const query = Lib.appendStage(queryWithAggregation);
      const stageIndex = -1;
      const source = suggestFields({
        query,
        stageIndex,
        availableColumns: columnsForExpressionMode({
          query,
          stageIndex,
          expressionMode,
        }),
      });

      const result = await complete(source, "[Bar aggregat|]");
      const aggregations = result?.options.filter(
        (option) => option.displayLabel === "Bar Aggregation",
      );
      expect(aggregations).toHaveLength(1);
    },
  );
});
