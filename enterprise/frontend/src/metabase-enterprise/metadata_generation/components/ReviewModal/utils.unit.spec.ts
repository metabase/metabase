import {
  createMockMetadataGenerationApplyResult,
  createMockMetadataGenerationProposal,
  createMockMetadataGenerationProposalTable,
} from "metabase-types/api/mocks";

import {
  formatSuggestionValue,
  getApplyRequestBody,
  getApplySummary,
  getBulkDecidable,
  getHumanSetPendingCount,
  getSuggestionValue,
  getTableCheckboxState,
  getTableLabel,
  setEdit,
  setSelected,
} from "./utils";

describe("getHumanSetPendingCount", () => {
  it("sums the human-set conflicts of all tables", () => {
    expect(
      getHumanSetPendingCount([
        createMockMetadataGenerationProposalTable({
          table_id: 1,
          pending: 5,
          human_set_pending: 1,
        }),
        createMockMetadataGenerationProposalTable({
          table_id: 2,
          pending: 4,
          human_set_pending: 2,
        }),
      ]),
    ).toBe(3);
  });

  it("is zero for no tables", () => {
    expect(getHumanSetPendingCount([])).toBe(0);
  });
});

describe("getBulkDecidable", () => {
  it("leaves human-set suggestions out of the table checkbox", () => {
    const suggestions = [
      createMockMetadataGenerationProposal({ id: 1, source: "none" }),
      createMockMetadataGenerationProposal({ id: 2, source: "human" }),
      createMockMetadataGenerationProposal({ id: 3, source: "deterministic" }),
      createMockMetadataGenerationProposal({ id: 4, source: "ai" }),
    ];

    expect(getBulkDecidable(suggestions).map((s) => s.id)).toEqual([1, 3, 4]);
  });
});

describe("getTableCheckboxState", () => {
  it("is indeterminate when some bulk-decidable suggestions are selected", () => {
    expect(
      getTableCheckboxState(
        [
          createMockMetadataGenerationProposal({ id: 1 }),
          createMockMetadataGenerationProposal({ id: 2 }),
        ],
        new Map([[1, "PII"]]),
      ),
    ).toEqual({ checked: false, indeterminate: true, disabled: false });
  });

  it("is checked when every bulk-decidable suggestion is selected, whatever the human-set ones", () => {
    expect(
      getTableCheckboxState(
        [
          createMockMetadataGenerationProposal({ id: 1 }),
          createMockMetadataGenerationProposal({ id: 2, source: "human" }),
        ],
        new Map([[1, "PII"]]),
      ),
    ).toEqual({ checked: true, indeterminate: false, disabled: false });
  });

  it("is disabled when no suggestion is bulk-decidable", () => {
    expect(
      getTableCheckboxState(
        [createMockMetadataGenerationProposal({ id: 1, source: "human" })],
        new Map(),
      ),
    ).toEqual({ checked: false, indeterminate: false, disabled: true });
  });
});

describe("review draft", () => {
  it("adds and removes suggestions with their proposed values without changing the input", () => {
    const selection = new Map([[1, "PII"]]);
    const added = setSelected(
      selection,
      [
        createMockMetadataGenerationProposal({ id: 2, proposed_value: "NONE" }),
        createMockMetadataGenerationProposal({
          id: 3,
          proposed_value: "BIZ_CONF",
        }),
      ],
      true,
    );
    expect([...added]).toEqual([
      [1, "PII"],
      [2, "NONE"],
      [3, "BIZ_CONF"],
    ]);
    expect([
      ...setSelected(
        selection,
        [createMockMetadataGenerationProposal({ id: 1 })],
        false,
      ),
    ]).toEqual([]);
    expect([...selection]).toEqual([[1, "PII"]]);
  });

  it("sets and clears an edit, and the value shown follows it", () => {
    const suggestion = createMockMetadataGenerationProposal({
      id: 1,
      proposed_value: "PII",
    });
    const edits = setEdit(new Map(), 1, "BIZ_CONF");
    expect(getSuggestionValue(suggestion, edits)).toBe("BIZ_CONF");
    expect(getSuggestionValue(suggestion, setEdit(edits, 1, null))).toBe("PII");
  });

  it("sends the selected ids with the proposed values seen, and only the edits of selected suggestions", () => {
    const edits = new Map([
      [3, "type/Score"],
      [4, "Not selected"],
    ]);
    expect(
      getApplyRequestBody(
        new Map([
          [3, "type/Category"],
          [1, "PII"],
        ]),
        edits,
      ),
    ).toEqual({
      accept: [1, 3],
      edits: { 3: "type/Score" },
      proposed_values: { 1: "PII", 3: "type/Category" },
    });
    expect(getApplyRequestBody(new Map([[1, "PII"]]), edits)).toEqual({
      accept: [1],
      proposed_values: { 1: "PII" },
    });
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
        createMockMetadataGenerationProposalTable({
          schema: "PUBLIC",
          table_name: "ORDERS",
        }),
      ),
    ).toBe("PUBLIC.ORDERS");
    expect(
      getTableLabel(
        createMockMetadataGenerationProposalTable({
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

  it("lists the written and failed counts", () => {
    expect(
      getApplySummary(
        createMockMetadataGenerationApplyResult({ written: 21, failed: 2 }),
      ),
    ).toBe("21 values written, 2 failed");
  });
});
