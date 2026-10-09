import {
  createMockMetadataGenerationApplyResult,
  createMockMetadataGenerationRunTable,
  createMockMetadataGenerationStatusCounts,
  createMockMetadataGenerationSuggestion,
} from "metabase-types/api/mocks";

import {
  canAcceptSuggestion,
  canRejectSuggestion,
  formatSuggestionValue,
  getApplySummary,
  getBulkAcceptable,
  getHumanSetAcceptable,
  getRejectable,
  getRunTotals,
  getTableLabel,
} from "./utils";

describe("getRunTotals", () => {
  it("sums the status counts, totals and human-set conflicts of all tables", () => {
    const totals = getRunTotals([
      createMockMetadataGenerationRunTable({
        table_id: 1,
        total: 5,
        counts: createMockMetadataGenerationStatusCounts({
          pending: 2,
          accepted: 3,
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
      counts: { pending: 3, accepted: 3, rejected: 1, stale: 1, applied: 1 },
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
    ["pending", true, true],
    ["accepted", false, true],
    ["rejected", true, false],
    ["stale", false, false],
    ["applied", false, false],
  ] as const)(
    "a %s suggestion can be accepted: %s, rejected: %s",
    (status, canAccept, canReject) => {
      const suggestion = createMockMetadataGenerationSuggestion({ status });
      expect(canAcceptSuggestion(suggestion)).toBe(canAccept);
      expect(canRejectSuggestion(suggestion)).toBe(canReject);
    },
  );

  it("leaves human-set suggestions out of the table accept and lists them apart", () => {
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
        status: "accepted",
      }),
      createMockMetadataGenerationSuggestion({
        id: 5,
        source: "human",
        status: "stale",
      }),
    ];

    expect(getBulkAcceptable(suggestions).map((s) => s.id)).toEqual([1, 3]);
    expect(getHumanSetAcceptable(suggestions).map((s) => s.id)).toEqual([2]);
    expect(getRejectable(suggestions).map((s) => s.id)).toEqual([1, 2, 4]);
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
