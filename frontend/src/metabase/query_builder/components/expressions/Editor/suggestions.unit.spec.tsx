import {
  CompletionContext,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";

import { createMockMetadata } from "__support__/metadata";
import { SAMPLE_DATABASE, createQuery } from "metabase-lib/test-helpers";
import {
  POPULAR_AGGREGATIONS,
  POPULAR_FILTERS,
  POPULAR_FUNCTIONS,
} from "metabase-lib/v1/expressions";
import {
  createMockCard,
  createMockDatabase,
  createMockField,
  createMockSegment,
  createMockStructuredDatasetQuery,
  createMockTable,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import {
  type SuggestOptions,
  suggestAggregations,
  suggestFields,
  suggestFunctions,
  suggestLiterals,
  suggestMetrics,
  suggestPopular,
  suggestSegments,
  suggestShortcuts,
} from "./suggestions";

function complete(source: CompletionSource | null, doc: string) {
  if (!source) {
    return null;
  }

  const cur = doc.indexOf("|");
  if (cur === -1) {
    throw new Error("Please use | to indicate the position of the cursor");
  }

  doc = doc.slice(0, cur) + doc.slice(cur + 1);

  const state = EditorState.create({
    doc,
    selection: { anchor: cur },
  });

  const ctx = new CompletionContext(state, cur, false);
  return source(ctx);
}

describe("suggestLiterals", () => {
  it("should suggest True and False", () => {
    const results = complete(suggestLiterals(), "Tru|");
    expect(results).toEqual({
      from: 0,
      to: 3,
      options: [
        {
          icon: "boolean",
          label: "True",
          type: "literal",
        },
        {
          icon: "boolean",
          label: "False",
          type: "literal",
        },
      ],
    });
  });

  it("should suggest True and False, from inside the word", () => {
    const results = complete(suggestLiterals(), "Tr|u");
    expect(results).toEqual({
      from: 0,
      to: 3,
      options: [
        {
          icon: "boolean",
          label: "True",
          type: "literal",
        },
        {
          icon: "boolean",
          label: "False",
          type: "literal",
        },
      ],
    });
  });
});

describe("suggestFunctions", () => {
  function setup({
    startRule = "expression",
    reportTimezone = "America/New_York",
  }: Partial<SuggestOptions>) {
    const metadata = createMockMetadata({
      databases: [createSampleDatabase()],
    });
    const query = createQuery({ metadata });
    const source = suggestFunctions({
      startRule,
      query,
      metadata,
      reportTimezone,
      shortcuts: [],
      stageIndex: 0,
      expressionIndex: 0,
    });

    return function (doc: string) {
      return complete(source, doc);
    };
  }

  const RESULTS = {
    filter: false,
    from: 0,
    to: 4,
    options: [
      {
        label: "concat",
        displayLabel: "concat",
        detail: "Combine two or more strings of text together.",
        matches: [[0, 3]],
        type: "function",
        icon: "function",
        apply: expect.any(Function),
      },
      {
        label: "contains",
        displayLabel: "contains",
        detail:
          "Returns true if string1 contains string2 within it (or string3, etc. if specified).",
        matches: [
          [0, 2],
          [6, 6],
        ],
        icon: "function",
        type: "function",
        apply: expect.any(Function),
      },
      {
        label: "second",
        displayLabel: "second",
        detail:
          "Takes a datetime and returns an integer (0-59) with the number of the seconds in the minute.",
        matches: [[2, 4]],
        type: "function",
        icon: "function",
        apply: expect.any(Function),
      },
      {
        label: "doesNotContain",
        displayLabel: "doesNotContain",
        detail:
          "Returns true if string1 does not contain string2 within it (and string3, etc. if specified).",
        matches: [
          [1, 1],
          [4, 5],
          [7, 9],
          [13, 13],
        ],
        type: "function",
        icon: "function",
        apply: expect.any(Function),
      },
    ],
  };

  const RESULTS_NO_TEMPLATE = {
    ...RESULTS,
    options: RESULTS.options.map(option => ({
      ...option,
      apply: undefined,
    })),
  };

  describe("startRule = expression", () => {
    const startRule = "expression";

    it("should suggest functions", () => {
      const completer = setup({ startRule });
      const results = completer("conc|");
      expect(results).toEqual(RESULTS);
    });

    it("should suggest functions, inside a word", () => {
      const completer = setup({ startRule });
      const results = completer("con|c");
      expect(results).toEqual(RESULTS);
    });

    it("should suggest functions, before parenthesis", () => {
      const cases = [
        "conc|(",
        "con|c(",
        "conc|()",
        "con|c()",
        "conc|([Foo]",
        "con|c([Foo]",
        "conc|([Foo])",
        "con|c([Foo])",
        "conc| (",
        "con|c (",
        "conc| ()",
        "con|c ()",
        "conc| ([Foo]",
        "con|c ([Foo]",
        "conc| ([Foo])",
        "con|c ([Foo])",
      ];
      for (const doc of cases) {
        const completer = setup({ startRule });
        const results = completer(doc);
        expect(results).toEqual(RESULTS_NO_TEMPLATE);
      }
    });

    it("should not suggest offset", async () => {
      const completer = setup({ startRule });
      const results = await completer("offse|");
      const options = results?.options.filter(
        option => option.label === "offset",
      );
      expect(options).toEqual([]);
    });

    it("should suggest case", async () => {
      const completer = setup({ startRule });
      const results = await completer("cas|");
      const options = results?.options.filter(
        option => option.label === "case",
      );
      expect(options).toEqual([
        {
          label: "case",
          displayLabel: "case",
          detail:
            "Alias for if(). Tests an expression against a list of cases and returns the corresponding value of the first matching case, with an optional default value if nothing else is met.",
          matches: [[0, 2]],
          type: "function",
          icon: "function",
          apply: expect.any(Function),
        },
      ]);
    });
  });

  describe("startRule = aggregation", () => {
    const startRule = "aggregation";

    it("should not suggest functions", () => {
      const completer = setup({ startRule });
      const results = completer("con|");
      expect(results).toEqual(null);
    });
  });

  describe("startRule = boolean", () => {
    const startRule = "boolean";

    it("should suggest functions", () => {
      const completer = setup({ startRule });
      const results = completer("conc|");
      expect(results).toEqual(RESULTS);
    });

    it("should suggest functions, inside a word", () => {
      const completer = setup({ startRule });
      const results = completer("con|c");
      expect(results).toEqual(RESULTS);
    });

    it("should suggest functions, before parenthesis, inside a word", () => {
      const completer = setup({ startRule });
      const results = completer("con|c()");
      expect(results).toEqual(RESULTS_NO_TEMPLATE);
    });
  });
});

describe("suggestAggregations", () => {
  function setup({ startRule = "aggregation" }: Partial<SuggestOptions>) {
    const metadata = createMockMetadata({
      databases: [createSampleDatabase()],
    });
    const query = createQuery({ metadata });
    const source = suggestAggregations({
      startRule,
      query,
      metadata,
      reportTimezone: "America/New_York",
      shortcuts: [],
      stageIndex: 0,
      expressionIndex: 0,
    });

    return function (doc: string) {
      return complete(source, doc);
    };
  }

  describe("startRule = expression", () => {
    const startRule = "expression";

    it("should not suggest aggregations", () => {
      const completer = setup({ startRule });
      const results = completer("Coun|");
      expect(results).toEqual(null);
    });
  });

  describe("startRule = boolean", () => {
    const startRule = "boolean";

    it("should not suggest aggregations", () => {
      const completer = setup({ startRule });
      const results = completer("Coun|");
      expect(results).toEqual(null);
    });
  });

  describe("startRule = aggregation", () => {
    const startRule = "aggregation";

    const RESULTS = {
      filter: false,
      from: 0,
      options: [
        {
          apply: expect.any(Function),
          detail: "Only counts rows where the condition is true.",
          displayLabel: "CountIf",
          icon: "function",
          label: "CountIf",
          matches: [[0, 3]],
          type: "aggregation",
        },
        {
          apply: expect.any(Function),
          detail: "Returns the count of rows in the selected data.",
          displayLabel: "Count",
          icon: "function",
          label: "Count",
          matches: [[0, 3]],
          type: "aggregation",
        },
        {
          apply: expect.any(Function),
          detail: "The additive total of rows across a breakout.",
          displayLabel: "CumulativeCount",
          icon: "function",
          label: "CumulativeCount",
          matches: [
            [0, 1],
            [3, 3],
            [10, 13],
          ],
          type: "aggregation",
        },
      ],
      to: 4,
    };

    const RESULTS_NO_TEMPLATE = {
      ...RESULTS,
      options: RESULTS.options.map(option => ({
        ...option,
        apply: undefined,
      })),
    };

    it("should suggest aggregations", () => {
      const completer = setup({ startRule });
      const results = completer("Coun|");
      expect(results).toEqual(RESULTS);
    });

    it("should suggest aggregations, inside a word", () => {
      const completer = setup({ startRule });
      const results = completer("Cou|n");
      expect(results).toEqual(RESULTS);
    });

    it("should suggest aggregatoins, before parenthesis", () => {
      const cases = [
        "Coun|(",
        "Cou|n(",
        "Coun|()",
        "Cou|n()",
        "Coun|([Foo]",
        "Cou|n([Foo]",
        "Coun|([Foo])",
        "Cou|n([Foo])",
        "Coun| (",
        "Cou|n (",
        "Coun| ()",
        "Cou|n ()",
        "Coun| ([Foo]",
        "Cou|n ([Foo]",
        "Coun| ([Foo])",
        "Cou|n ([Foo])",
      ];
      for (const doc of cases) {
        const completer = setup({ startRule });
        const results = completer(doc);
        expect(results).toEqual(RESULTS_NO_TEMPLATE);
      }
    });
  });
});

describe("suggestFields", () => {
  function setup({ startRule = "expression" }: Partial<SuggestOptions> = {}) {
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

    const metadata = createMockMetadata({
      databases: [DATABASE],
    });

    const query = createQuery({
      databaseId: DATABASE.id,
      metadata: createMockMetadata({ databases: [DATABASE] }),
      query: {
        database: DATABASE.id,
        type: "query",
        query: {
          "source-table": TABLE.id,
        },
      },
    });

    const source = suggestFields({
      startRule,
      query,
      metadata,
      reportTimezone: "America/New_York",
      shortcuts: [],
      stageIndex: 0,
      expressionIndex: 0,
    });

    return function (doc: string) {
      return complete(source, doc);
    };
  }

  const RESULTS = {
    filter: false,
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
    filter: false,
    from: 0,
    to: 1,
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
});

describe("suggestPopular", () => {
  function setup({ startRule = "expression" }: Partial<SuggestOptions> = {}) {
    const metadata = createMockMetadata({
      databases: [createSampleDatabase()],
    });
    const query = createQuery({ metadata });
    const source = suggestPopular({
      startRule,
      query,
      metadata,
      reportTimezone: "America/New_York",
      shortcuts: [],
      stageIndex: 0,
      expressionIndex: 0,
    });

    return function (doc: string) {
      return complete(source, doc);
    };
  }

  describe("startRule = expression", () => {
    const startRule = "expression";

    it("should suggest popular functions when the doc is empty", async () => {
      const complete = setup({ startRule });
      const results = await complete("|");
      expect(results).toEqual({
        from: 0,
        options: expect.any(Array),
      });
      expect(results?.options).toHaveLength(POPULAR_FUNCTIONS.length);
    });

    it("should not suggest popular functions when the doc is not empty", () => {
      const complete = setup({ startRule });
      const results = complete("hello|");
      expect(results).toEqual(null);
    });
  });

  describe("startRule = boolean", () => {
    const startRule = "boolean";

    it("should suggest popular filters when the doc is empty", async () => {
      const complete = setup({ startRule });
      const results = await complete("|");
      expect(results).toEqual({
        from: 0,
        options: expect.any(Array),
      });
      expect(results?.options).toHaveLength(POPULAR_FILTERS.length);
    });

    it("should not suggest popular filters when the doc is not empty", () => {
      const complete = setup({ startRule });
      const results = complete("hello|");
      expect(results).toEqual(null);
    });
  });

  describe("startRule = aggregation", () => {
    const startRule = "aggregation";

    it("should suggest popular aggregations when the doc is empty", async () => {
      const complete = setup({ startRule });
      const results = await complete("|");
      expect(results).toEqual({
        from: 0,
        options: expect.any(Array),
      });
      expect(results?.options).toHaveLength(POPULAR_AGGREGATIONS.length);
    });

    it("should not suggest popular aggregations when the doc is not empty", () => {
      const complete = setup({ startRule });
      const results = complete("hello|");
      expect(results).toEqual(null);
    });
  });
});

describe("suggestShortcuts", () => {
  function setup({ shortcuts }: Partial<SuggestOptions>) {
    const metadata = createMockMetadata({
      databases: [createSampleDatabase()],
    });
    const query = createQuery({ metadata });
    const source = suggestShortcuts({
      startRule: "expression",
      query,
      metadata,
      reportTimezone: "America/New_York",
      shortcuts,
      stageIndex: 0,
      expressionIndex: 0,
    });

    return function (doc: string) {
      return complete(source, doc);
    };
  }

  it("should suggest shortcuts on an empty document", () => {
    const complete = setup({
      shortcuts: [
        {
          name: "foo",
          icon: "function",
          action: jest.fn(),
        },
        {
          name: "bar",
          icon: "list",
          action: jest.fn(),
        },
      ],
    });
    const results = complete("|");
    expect(results).toEqual({
      from: 0,
      options: [
        {
          label: "foo",
          icon: "function",
          section: "shortcuts",
          apply: expect.any(Function),
        },
        {
          label: "bar",
          icon: "list",
          section: "shortcuts",
          apply: expect.any(Function),
        },
      ],
    });
  });

  it("should not suggest shortcuts on an non-empty document", () => {
    const complete = setup({
      shortcuts: [
        {
          name: "foo",
          icon: "function",
          action: jest.fn(),
        },
      ],
    });
    const results = complete("hello|");
    expect(results).toEqual(null);
  });
});

describe("suggestMetrics", () => {
  function setup({ startRule = "expression" }: Partial<SuggestOptions>) {
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
      metadata,
      reportTimezone: "America/New_York",
      shortcuts: [],
      stageIndex: -1,
      expressionIndex: 0,
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

describe("suggestSegments", () => {
  function setup() {
    const DATABASE_ID = SAMPLE_DATABASE.id;
    const TABLE_ID = 1;

    const SEGMENT_FOO = createMockSegment({
      id: 1,
      name: "Foo",
      table_id: TABLE_ID,
    });

    const SEGMENT_BAR = createMockSegment({
      id: 2,
      name: "Bar",
      table_id: TABLE_ID,
    });

    const TABLE = createMockTable({
      db_id: DATABASE_ID,
      id: TABLE_ID,
      segments: [SEGMENT_FOO, SEGMENT_BAR],
    });

    const DATABASE = createSampleDatabase({
      id: DATABASE_ID,
      name: "Database",
      tables: [TABLE],
    });

    const metadata = createMockMetadata({
      databases: [DATABASE],
      tables: [TABLE],
      segments: [SEGMENT_FOO, SEGMENT_BAR],
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

    const source = suggestSegments({
      startRule: "expression",
      query,
      metadata,
      reportTimezone: "America/New_York",
      shortcuts: [],
      stageIndex: -1,
      expressionIndex: 0,
    });

    return function (doc: string) {
      return complete(source, doc);
    };
  }

  it("should suggest segments", () => {
    const complete = setup();
    const results = complete("Fo|");
    expect(results).toEqual({
      filter: false,
      from: 0,
      to: 2,
      options: [
        {
          label: "[Foo]",
          displayLabel: "Foo",
          type: "segment",
          icon: "segment",
          matches: [[0, 1]],
        },
      ],
    });
  });

  it("should suggest segments, inside word", () => {
    const complete = setup();
    const results = complete("F|o");
    expect(results).toEqual({
      filter: false,
      from: 0,
      to: 2,
      options: [
        {
          label: "[Foo]",
          displayLabel: "Foo",
          type: "segment",
          icon: "segment",
          matches: [[0, 1]],
        },
      ],
    });
  });
});
