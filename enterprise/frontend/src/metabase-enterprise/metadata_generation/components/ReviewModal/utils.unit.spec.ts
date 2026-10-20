import {
  createMockMetadataGenerationApplyResult,
  createMockMetadataGenerationRunTable,
  createMockMetadataGenerationStatusCounts,
  createMockMetadataGenerationSuggestion,
} from "metabase-types/api/mocks";

import {
  formatSuggestionValue,
  getApplyRequestBody,
  getApplySummary,
  getBulkDecidable,
  getRunTotals,
  getSuggestionValue,
  getTableCheckboxState,
  getTableLabel,
  isSuggestionDecidable,
  setEdit,
  setSelected,
} from "./utils";

describe("getRunTotals", () => {
  it("sums the status counts, totals and human-set conflicts of all tables", () => {
    const totals = getRunTotals([
      createMockMetadataGenerationRunTable({
        table_id: 1,
        total: 5,
        counts: createMockMetadataGenerationStatusCounts({
          pending: 2,
          applied: 3,
        }),
        human_set_pending: 1,
      }),
      createMockMetadataGenerationRunTable({
        table_id: 2,
        total: 4,
        counts: createMockMetadataGenerationStatusCounts({
          pending: 1,
          rejected: 1,
          stale: 1,
          applied: 1,
        }),
        human_set_pending: 1,
      }),
    ]);

    expect(totals).toEqual({
      total: 9,
      counts: { pending: 3, rejected: 1, stale: 1, applied: 4 },
      humanSetPending: 2,
    });
  });

  it("returns zero counts for no tables", () => {
    expect(getRunTotals([])).toEqual({
      total: 0,
      counts: createMockMetadataGenerationStatusCounts(),
      humanSetPending: 0,
    });
  });
});

describe("decision state", () => {
  it.each([
    ["pending", true],
    ["rejected", true],
    ["stale", false],
    ["applied", false],
  ] as const)("a %s suggestion is decidable: %s", (status, decidable) => {
    const suggestion = createMockMetadataGenerationSuggestion({ status });
    expect(isSuggestionDecidable(suggestion)).toBe(decidable);
  });

  it("leaves human-set and fixed suggestions out of the table checkbox", () => {
    const suggestions = [
      createMockMetadataGenerationSuggestion({ id: 1, source: "none" }),
      createMockMetadataGenerationSuggestion({ id: 2, source: "human" }),
      createMockMetadataGenerationSuggestion({
        id: 3,
        source: "deterministic",
        status: "rejected",
      }),
      createMockMetadataGenerationSuggestion({
        id: 4,
        source: "ai",
        status: "applied",
      }),
      createMockMetadataGenerationSuggestion({
        id: 5,
        source: "none",
        status: "stale",
      }),
    ];

    expect(getBulkDecidable(suggestions).map((s) => s.id)).toEqual([1, 3]);
  });
});

describe("getTableCheckboxState", () => {
  it("is indeterminate when some bulk-decidable suggestions are selected", () => {
    expect(
      getTableCheckboxState(
        [
          createMockMetadataGenerationSuggestion({ id: 1 }),
          createMockMetadataGenerationSuggestion({ id: 2, status: "rejected" }),
        ],
        new Set([1]),
      ),
    ).toEqual({ checked: false, indeterminate: true, disabled: false });
  });

  it("is checked when every bulk-decidable suggestion is selected, whatever the human-set ones", () => {
    expect(
      getTableCheckboxState(
        [
          createMockMetadataGenerationSuggestion({ id: 1 }),
          createMockMetadataGenerationSuggestion({ id: 2, source: "human" }),
          createMockMetadataGenerationSuggestion({ id: 3, status: "applied" }),
        ],
        new Set([1]),
      ),
    ).toEqual({ checked: true, indeterminate: false, disabled: false });
  });

  it("is disabled when no suggestion is bulk-decidable", () => {
    expect(
      getTableCheckboxState(
        [
          createMockMetadataGenerationSuggestion({ id: 1, source: "human" }),
          createMockMetadataGenerationSuggestion({ id: 2, status: "stale" }),
        ],
        new Set(),
      ),
    ).toEqual({ checked: false, indeterminate: false, disabled: true });
  });
});

describe("review draft", () => {
  it("adds and removes ids from the selection without changing the input", () => {
    const selection = new Set([1]);
    expect([...setSelected(selection, [2, 3], true)]).toEqual([1, 2, 3]);
    expect([...setSelected(selection, [1], false)]).toEqual([]);
    expect([...selection]).toEqual([1]);
  });

  it("sets and clears an edit, and the value shown follows it", () => {
    const suggestion = createMockMetadataGenerationSuggestion({
      id: 1,
      proposed_value: "PII",
    });
    const edits = setEdit(new Map(), 1, "BIZ_CONF");
    expect(getSuggestionValue(suggestion, edits)).toBe("BIZ_CONF");
    expect(getSuggestionValue(suggestion, setEdit(edits, 1, null))).toBe("PII");
  });

  it("sends the selected ids and only the edits of selected suggestions", () => {
    const edits = new Map([
      [3, "type/Score"],
      [4, "Not selected"],
    ]);
    expect(getApplyRequestBody(new Set([3, 1]), edits)).toEqual({
      accept: [1, 3],
      edits: { 3: "type/Score" },
    });
    expect(getApplyRequestBody(new Set([1]), edits)).toEqual({ accept: [1] });
  });
});

describe("formatSuggestionValue", () => {
  it("shows the label of a data sensitivity", () => {
    expect(formatSuggestionValue("data_sensitivity", "PII")).toBe(
      "Personally identifiable information",
    );
  });

  it("shows the name of a semantic type", () => {
    expect(formatSuggestionValue("semantic_type", "type/Email")).toBe("Email");
  });

  it("shows an unknown value as is", () => {
    expect(formatSuggestionValue("semantic_type", "type/Unknown")).toBe(
      "type/Unknown",
    );
  });

  it("returns null for an empty value", () => {
    expect(formatSuggestionValue("description", null)).toBeNull();
    expect(formatSuggestionValue("description", "")).toBeNull();
  });
});

describe("getTableLabel", () => {
  it("prefixes the schema when there is one", () => {
    expect(
      getTableLabel(
        createMockMetadataGenerationRunTable({
          schema: "PUBLIC",
          table_name: "ORDERS",
        }),
      ),
    ).toBe("PUBLIC.ORDERS");
    expect(
      getTableLabel(
        createMockMetadataGenerationRunTable({
          schema: null,
          table_name: "ORDERS",
        }),
      ),
    ).toBe("ORDERS");
  });
});

describe("getApplySummary", () => {
  it("lists only the written count when nothing was skipped or failed", () => {
    expect(
      getApplySummary(createMockMetadataGenerationApplyResult({ written: 1 })),
    ).toBe("1 value written");
  });

  it("lists the rejected count when there is one", () => {
    expect(
      getApplySummary(
        createMockMetadataGenerationApplyResult({ written: 2, rejected: 1 }),
      ),
    ).toBe("2 values written, 1 rejected");
  });

  it("lists the written, stale and failed counts", () => {
    expect(
      getApplySummary(
        createMockMetadataGenerationApplyResult({
          written: 21,
          stale: 1,
          failed: 2,
        }),
      ),
    ).toBe("21 values written, 1 skipped because the field changed, 2 failed");
  });
});
