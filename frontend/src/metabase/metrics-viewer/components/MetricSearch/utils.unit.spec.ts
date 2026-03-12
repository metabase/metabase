import type { ExpressionToken } from "../../types/operators";
import type { SelectedMetric } from "../../types/viewer-state";

import {
  buildExpressionText,
  cleanupParens,
  filterSearchResults,
  getSelectedMeasureIds,
  getSelectedMetricIds,
  parseFullText,
} from "./utils";

function makeSelectedMetric(
  overrides: Partial<SelectedMetric> &
    Pick<SelectedMetric, "id" | "sourceType">,
): SelectedMetric {
  return { name: "Test", ...overrides };
}

function makeSearchResult(id: number, model: "metric" | "measure") {
  return { id, model, name: `Result ${id}` };
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
  const m = (metricIndex: number): ExpressionToken => ({
    type: "metric",
    metricIndex,
  });
  const op = (o: "+" | "-" | "*" | "/"): ExpressionToken => ({
    type: "operator",
    op: o,
  });
  const open: ExpressionToken = { type: "open-paren" };
  const close: ExpressionToken = { type: "close-paren" };

  it("returns empty array unchanged", () => {
    expect(cleanupParens([])).toEqual([]);
  });

  it("returns same reference when no cleanup needed", () => {
    const tokens: ExpressionToken[] = [m(0), op("+"), m(1)];
    expect(cleanupParens(tokens)).toBe(tokens);
  });

  it("removes empty parentheses", () => {
    expect(cleanupParens([open, close])).toEqual([]);
  });

  it("removes parentheses around a single metric", () => {
    expect(cleanupParens([open, m(0), close])).toEqual([m(0)]);
  });

  it("keeps parentheses around multiple metrics", () => {
    const tokens = [open, m(0), op("+"), m(1), close];
    expect(cleanupParens(tokens)).toEqual(tokens);
  });

  it("removes nested single-metric parens", () => {
    // ((A)) → A
    expect(cleanupParens([open, open, m(0), close, close])).toEqual([m(0)]);
  });

  it("removes inner single-metric parens but keeps outer multi-metric parens", () => {
    // (A + (B)) → (A + B)
    expect(
      cleanupParens([open, m(0), op("+"), open, m(1), close, close]),
    ).toEqual([open, m(0), op("+"), m(1), close]);
  });

  it("removes single-metric parens in a larger expression", () => {
    // (A) + B → A + B
    expect(cleanupParens([open, m(0), close, op("+"), m(1)])).toEqual([
      m(0),
      op("+"),
      m(1),
    ]);
  });

  it("removes multiple independent single-metric paren groups", () => {
    // (A) + (B) → A + B
    expect(
      cleanupParens([open, m(0), close, op("+"), open, m(1), close]),
    ).toEqual([m(0), op("+"), m(1)]);
  });

  it("keeps parentheses around a metric and a constant (two operands)", () => {
    // (A * 0.85) stays — two operands inside
    const k = (v: number): ExpressionToken => ({ type: "constant", value: v });
    expect(cleanupParens([open, m(0), op("*"), k(0.85), close])).toEqual([
      open,
      m(0),
      op("*"),
      k(0.85),
      close,
    ]);
  });

  it("removes parentheses around a lone constant (one operand)", () => {
    const k = (v: number): ExpressionToken => ({ type: "constant", value: v });
    expect(cleanupParens([open, k(1), close])).toEqual([k(1)]);
  });
});

// ---------------------------------------------------------------------------
// buildExpressionText — constants
// ---------------------------------------------------------------------------

describe("buildExpressionText", () => {
  const revenue: SelectedMetric = {
    id: 1,
    name: "Revenue",
    sourceType: "metric",
  };
  const costs: SelectedMetric = { id: 2, name: "Costs", sourceType: "metric" };
  const metrics = [revenue, costs];

  const m = (idx: number): ExpressionToken => ({
    type: "metric",
    metricIndex: idx,
  });
  const op = (o: "+" | "-" | "*" | "/"): ExpressionToken => ({
    type: "operator",
    op: o,
  });
  const k = (v: number): ExpressionToken => ({ type: "constant", value: v });
  const open: ExpressionToken = { type: "open-paren" };
  const close: ExpressionToken = { type: "close-paren" };

  it("renders a metric scaled by a decimal constant", () => {
    expect(buildExpressionText([m(0), op("*"), k(0.85)], metrics)).toBe(
      "Revenue * 0.85",
    );
  });

  it("renders an integer constant", () => {
    expect(buildExpressionText([m(0), op("*"), k(100)], metrics)).toBe(
      "Revenue * 100",
    );
  });

  it("renders constants inside parentheses", () => {
    // (Revenue + Costs) * 0.85
    expect(
      buildExpressionText(
        [open, m(0), op("+"), m(1), close, op("*"), k(0.85)],
        metrics,
      ),
    ).toBe("(Revenue + Costs) * 0.85");
  });

  it("renders a constant divided by a metric", () => {
    expect(buildExpressionText([k(1), op("/"), m(0)], metrics)).toBe(
      "1 / Revenue",
    );
  });
});

// ---------------------------------------------------------------------------
// parseFullText — numeric literals
// ---------------------------------------------------------------------------

describe("parseFullText — numeric literal parsing", () => {
  const revenue: SelectedMetric = {
    id: 1,
    name: "Revenue",
    sourceType: "metric",
  };
  const costs: SelectedMetric = { id: 2, name: "Costs", sourceType: "metric" };
  const metrics = [revenue, costs];

  const m = (idx: number): ExpressionToken => ({
    type: "metric",
    metricIndex: idx,
  });
  const op = (o: "+" | "-" | "*" | "/"): ExpressionToken => ({
    type: "operator",
    op: o,
  });
  const k = (v: number): ExpressionToken => ({ type: "constant", value: v });

  it("parses a metric multiplied by a decimal constant", () => {
    expect(parseFullText("Revenue * 0.85", metrics)).toEqual([
      m(0),
      op("*"),
      k(0.85),
    ]);
  });

  it("parses a metric multiplied by an integer constant", () => {
    expect(parseFullText("Revenue * 100", metrics)).toEqual([
      m(0),
      op("*"),
      k(100),
    ]);
  });

  it("parses a constant on the left side", () => {
    expect(parseFullText("0.5 * Revenue", metrics)).toEqual([
      k(0.5),
      op("*"),
      m(0),
    ]);
  });

  it("parses a constant inside parentheses — (Revenue + Costs) * 0.85", () => {
    expect(parseFullText("(Revenue + Costs) * 0.85", metrics)).toEqual([
      { type: "open-paren" },
      m(0),
      op("+"),
      m(1),
      { type: "close-paren" },
      op("*"),
      k(0.85),
    ]);
  });

  it("parses multiple constants in one expression", () => {
    // 0.5 * Revenue + 0.5 * Costs
    expect(parseFullText("0.5 * Revenue + 0.5 * Costs", metrics)).toEqual([
      k(0.5),
      op("*"),
      m(0),
      op("+"),
      k(0.5),
      op("*"),
      m(1),
    ]);
  });

  it("handles an integer that looks like it could start a decimal (no dot follows)", () => {
    // "1 + Revenue" — "1" is an integer with no fractional part
    expect(parseFullText("1 + Revenue", metrics)).toEqual([
      k(1),
      op("+"),
      m(0),
    ]);
  });

  it("does not parse a trailing dot as part of the number", () => {
    // "1." — trailing dot with no digit after it; "1" is the constant, "." is skipped
    expect(parseFullText("1.", metrics)).toEqual([k(1)]);
  });

  it("parses constants and metrics as separate items separated by a comma", () => {
    // "Revenue * 0.85, Costs"
    expect(parseFullText("Revenue * 0.85, Costs", metrics)).toEqual([
      m(0),
      op("*"),
      k(0.85),
      { type: "separator" },
      m(1),
    ]);
  });

  it("round-trips through buildExpressionText", () => {
    const text = "(Revenue + Costs) * 0.85";
    const tokens = parseFullText(text, metrics);
    // Remove the separator-less single item and rebuild
    const [item] = [tokens]; // only one item (no separators)
    expect(buildExpressionText(item as ExpressionToken[], metrics)).toBe(text);
  });
});
