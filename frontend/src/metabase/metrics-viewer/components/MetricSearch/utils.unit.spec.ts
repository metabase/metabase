import type {
  ExpressionSubToken,
  MetricDefinitionEntry,
  MetricSourceId,
  SelectedMetric,
} from "../../types/viewer-state";

import {
  buildExpressionText,
  cleanupParens,
  filterSearchResults,
  getSelectedMeasureIds,
  getSelectedMetricIds,
  parseFullText,
} from "./utils";

jest.mock("../../utils/definition-builder", () => ({
  getDefinitionName: (def: any) => def?.["display-name"] ?? null,
}));

function makeSelectedMetric(
  overrides: Partial<SelectedMetric> &
    Pick<SelectedMetric, "id" | "sourceType">,
): SelectedMetric {
  return { name: "Test", ...overrides };
}

function makeSearchResult(id: number, model: "metric" | "measure") {
  return { id, model, name: `Result ${id}` };
}

/**
 * Helper to create a fake MetricDefinitionEntry with a minimal definition
 * that has the given name. The definition is cast to satisfy the type but
 * only supports getDefinitionName (which reads displayName from lib).
 */
function makeMetricEntry(
  sourceId: MetricSourceId,
  name: string,
): MetricDefinitionEntry {
  // getDefinitionName calls LibMetric.displayName which returns the
  // `display-name` key from the definition JS object. We fake it here.
  const fakeDefinition = {
    "display-name": name,
  } as unknown as MetricDefinitionEntry["definition"];
  return {
    id: sourceId,
    type: "metric",
    definition: fakeDefinition,
  };
}

describe("getSelectedMetricIds", () => {
  it("returns Set of IDs for metrics only", () => {
    const selected: SelectedMetric[] = [
      makeSelectedMetric({ id: 1, sourceType: "metric" }),
      makeSelectedMetric({ id: 2, sourceType: "measure" }),
      makeSelectedMetric({ id: 3, sourceType: "metric" }),
    ];
    const result = getSelectedMetricIds(selected);
    expect(result).toEqual(new Set([1, 3]));
  });

  it("returns empty Set for empty array", () => {
    expect(getSelectedMetricIds([])).toEqual(new Set());
  });

  it("returns empty Set when no metrics exist", () => {
    const selected: SelectedMetric[] = [
      makeSelectedMetric({ id: 1, sourceType: "measure" }),
    ];
    expect(getSelectedMetricIds(selected)).toEqual(new Set());
  });
});

describe("getSelectedMeasureIds", () => {
  it("returns Set of IDs for measures only", () => {
    const selected: SelectedMetric[] = [
      makeSelectedMetric({ id: 1, sourceType: "metric" }),
      makeSelectedMetric({ id: 2, sourceType: "measure" }),
      makeSelectedMetric({ id: 5, sourceType: "measure" }),
    ];
    const result = getSelectedMeasureIds(selected);
    expect(result).toEqual(new Set([2, 5]));
  });

  it("returns empty Set for empty array", () => {
    expect(getSelectedMeasureIds([])).toEqual(new Set());
  });

  it("returns empty Set when no measures exist", () => {
    const selected: SelectedMetric[] = [
      makeSelectedMetric({ id: 1, sourceType: "metric" }),
    ];
    expect(getSelectedMeasureIds(selected)).toEqual(new Set());
  });
});

describe("filterSearchResults", () => {
  const results = [
    makeSearchResult(1, "metric"),
    makeSearchResult(2, "metric"),
    makeSearchResult(10, "measure"),
    makeSearchResult(20, "measure"),
  ];

  it("excludes already-selected metrics by ID", () => {
    const filtered = filterSearchResults(results, new Set([1]), new Set());
    expect(filtered.map((r) => ({ id: r.id, model: r.model }))).toEqual([
      { id: 2, model: "metric" },
      { id: 10, model: "measure" },
      { id: 20, model: "measure" },
    ]);
  });

  it("excludes already-selected measures by ID", () => {
    const filtered = filterSearchResults(results, new Set(), new Set([10, 20]));
    expect(filtered.map((r) => ({ id: r.id, model: r.model }))).toEqual([
      { id: 1, model: "metric" },
      { id: 2, model: "metric" },
    ]);
  });

  it("excludes the excludeMetric param", () => {
    const filtered = filterSearchResults(results, new Set(), new Set(), {
      id: 2,
      sourceType: "metric",
    });
    expect(filtered.map((r) => ({ id: r.id, model: r.model }))).toEqual([
      { id: 1, model: "metric" },
      { id: 10, model: "measure" },
      { id: 20, model: "measure" },
    ]);
  });

  it("excludeMetric only matches same model type", () => {
    const filtered = filterSearchResults(results, new Set(), new Set(), {
      id: 1,
      sourceType: "measure",
    });
    expect(filtered).toHaveLength(4);
  });

  it("handles empty results", () => {
    const filtered = filterSearchResults([], new Set([1]), new Set([2]));
    expect(filtered).toEqual([]);
  });

  it("combines all exclusion criteria", () => {
    const filtered = filterSearchResults(results, new Set([1]), new Set([10]), {
      id: 2,
      sourceType: "metric",
    });
    expect(filtered.map((r) => ({ id: r.id, model: r.model }))).toEqual([
      { id: 20, model: "measure" },
    ]);
  });
});

describe("cleanupParens", () => {
  const m = (sourceId: MetricSourceId): ExpressionSubToken => ({
    type: "metric",
    sourceId,
  });
  const op = (o: "+" | "-" | "*" | "/"): ExpressionSubToken => ({
    type: "operator",
    op: o,
  });
  const open: ExpressionSubToken = { type: "open-paren" };
  const close: ExpressionSubToken = { type: "close-paren" };

  it("returns empty array unchanged", () => {
    expect(cleanupParens([])).toEqual([]);
  });

  it("returns same reference when no cleanup needed", () => {
    const tokens: ExpressionSubToken[] = [
      m("metric:1"),
      op("+"),
      m("metric:2"),
    ];
    expect(cleanupParens(tokens)).toBe(tokens);
  });

  it("removes empty parentheses", () => {
    expect(cleanupParens([open, close])).toEqual([]);
  });

  it("removes parentheses around a single metric", () => {
    expect(cleanupParens([open, m("metric:1"), close])).toEqual([
      m("metric:1"),
    ]);
  });

  it("keeps parentheses around multiple metrics", () => {
    const tokens = [open, m("metric:1"), op("+"), m("metric:2"), close];
    expect(cleanupParens(tokens)).toEqual(tokens);
  });

  it("removes nested single-metric parens", () => {
    // ((A)) → A
    expect(cleanupParens([open, open, m("metric:1"), close, close])).toEqual([
      m("metric:1"),
    ]);
  });

  it("removes inner single-metric parens but keeps outer multi-metric parens", () => {
    // (A + (B)) → (A + B)
    expect(
      cleanupParens([
        open,
        m("metric:1"),
        op("+"),
        open,
        m("metric:2"),
        close,
        close,
      ]),
    ).toEqual([open, m("metric:1"), op("+"), m("metric:2"), close]);
  });

  it("removes single-metric parens in a larger expression", () => {
    // (A) + B → A + B
    expect(
      cleanupParens([open, m("metric:1"), close, op("+"), m("metric:2")]),
    ).toEqual([m("metric:1"), op("+"), m("metric:2")]);
  });

  it("removes multiple independent single-metric paren groups", () => {
    // (A) + (B) → A + B
    expect(
      cleanupParens([
        open,
        m("metric:1"),
        close,
        op("+"),
        open,
        m("metric:2"),
        close,
      ]),
    ).toEqual([m("metric:1"), op("+"), m("metric:2")]);
  });

  it("keeps parentheses around a metric and a constant (two operands)", () => {
    // (A * 0.85) stays — two operands inside
    const k = (v: number): ExpressionSubToken => ({
      type: "constant",
      value: v,
    });
    expect(
      cleanupParens([open, m("metric:1"), op("*"), k(0.85), close]),
    ).toEqual([open, m("metric:1"), op("*"), k(0.85), close]);
  });

  it("removes parentheses around a lone constant (one operand)", () => {
    const k = (v: number): ExpressionSubToken => ({
      type: "constant",
      value: v,
    });
    expect(cleanupParens([open, k(1), close])).toEqual([k(1)]);
  });
});

// ---------------------------------------------------------------------------
// buildExpressionText — constants
// ---------------------------------------------------------------------------

describe("buildExpressionText", () => {
  const revenueEntry = makeMetricEntry("metric:1", "Revenue");
  const costsEntry = makeMetricEntry("metric:2", "Costs");
  const metricEntries = [revenueEntry, costsEntry];

  const m = (sourceId: MetricSourceId): ExpressionSubToken => ({
    type: "metric",
    sourceId,
  });
  const op = (o: "+" | "-" | "*" | "/"): ExpressionSubToken => ({
    type: "operator",
    op: o,
  });
  const k = (v: number): ExpressionSubToken => ({
    type: "constant",
    value: v,
  });
  const open: ExpressionSubToken = { type: "open-paren" };
  const close: ExpressionSubToken = { type: "close-paren" };

  it("renders a metric scaled by a decimal constant", () => {
    expect(
      buildExpressionText([m("metric:1"), op("*"), k(0.85)], metricEntries),
    ).toBe("Revenue * 0.85");
  });

  it("renders an integer constant", () => {
    expect(
      buildExpressionText([m("metric:1"), op("*"), k(100)], metricEntries),
    ).toBe("Revenue * 100");
  });

  it("renders constants inside parentheses", () => {
    // (Revenue + Costs) * 0.85
    expect(
      buildExpressionText(
        [open, m("metric:1"), op("+"), m("metric:2"), close, op("*"), k(0.85)],
        metricEntries,
      ),
    ).toBe("(Revenue + Costs) * 0.85");
  });

  it("renders a constant divided by a metric", () => {
    expect(
      buildExpressionText([k(1), op("/"), m("metric:1")], metricEntries),
    ).toBe("1 / Revenue");
  });
});

// ---------------------------------------------------------------------------
// parseFullText — numeric literals
// ---------------------------------------------------------------------------

describe("parseFullText — numeric literal parsing", () => {
  const revenueEntry = makeMetricEntry("metric:1", "Revenue");
  const costsEntry = makeMetricEntry("metric:2", "Costs");
  const metricEntries = [revenueEntry, costsEntry];

  const m = (sourceId: MetricSourceId): ExpressionSubToken => ({
    type: "metric",
    sourceId,
  });
  const op = (o: "+" | "-" | "*" | "/"): ExpressionSubToken => ({
    type: "operator",
    op: o,
  });
  const k = (v: number): ExpressionSubToken => ({
    type: "constant",
    value: v,
  });

  it("parses a metric multiplied by a decimal constant", () => {
    const result = parseFullText("Revenue * 0.85", metricEntries);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [m("metric:1"), op("*"), k(0.85)],
    });
  });

  it("parses a metric multiplied by an integer constant", () => {
    const result = parseFullText("Revenue * 100", metricEntries);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [m("metric:1"), op("*"), k(100)],
    });
  });

  it("parses a constant on the left side", () => {
    const result = parseFullText("0.5 * Revenue", metricEntries);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [k(0.5), op("*"), m("metric:1")],
    });
  });

  it("parses a constant inside parentheses — (Revenue + Costs) * 0.85", () => {
    const result = parseFullText("(Revenue + Costs) * 0.85", metricEntries);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [
        { type: "open-paren" },
        m("metric:1"),
        op("+"),
        m("metric:2"),
        { type: "close-paren" },
        op("*"),
        k(0.85),
      ],
    });
  });

  it("parses multiple constants in one expression", () => {
    // 0.5 * Revenue + 0.5 * Costs
    const result = parseFullText("0.5 * Revenue + 0.5 * Costs", metricEntries);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [
        k(0.5),
        op("*"),
        m("metric:1"),
        op("+"),
        k(0.5),
        op("*"),
        m("metric:2"),
      ],
    });
  });

  it("handles an integer that looks like it could start a decimal (no dot follows)", () => {
    // "1 + Revenue" — "1" is an integer with no fractional part
    const result = parseFullText("1 + Revenue", metricEntries);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [k(1), op("+"), m("metric:1")],
    });
  });

  it("does not parse a trailing dot as part of the number", () => {
    // "1." — trailing dot with no digit after it; "1" is the constant, "." is skipped
    const result = parseFullText("1.", metricEntries);
    expect(result).toHaveLength(1);
    // Single constant → still becomes an expression entry since it's not a metric name
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [k(1)],
    });
  });

  it("parses constants and metrics as separate items separated by a comma", () => {
    // "Revenue * 0.85, Costs"
    const result = parseFullText("Revenue * 0.85, Costs", metricEntries);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [m("metric:1"), op("*"), k(0.85)],
    });
    // "Costs" is a standalone metric
    expect(result[1]).toMatchObject({
      type: "metric",
      id: "metric:2",
    });
  });

  it("round-trips through buildExpressionText", () => {
    const text = "(Revenue + Costs) * 0.85";
    const result = parseFullText(text, metricEntries);
    expect(result).toHaveLength(1);
    const entry = result[0];
    if (entry.type === "expression") {
      // eslint-disable-next-line jest/no-conditional-expect
      expect(buildExpressionText(entry.tokens, metricEntries)).toBe(text);
    } else {
      throw new Error("Expected expression entry");
    }
  });
});
