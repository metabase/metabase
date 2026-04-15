import * as LibMetric from "metabase-lib/metric";

import type {
  ExpressionDefinitionEntry,
  ExpressionSubToken,
  MetricDefinitionEntry,
  MetricSourceId,
  MetricsViewerFormulaEntity,
} from "../../types/viewer-state";
import { isExpressionEntry } from "../../types/viewer-state";
import {
  GEO_METRIC,
  REVENUE_METRIC,
  createMetricMetadata,
  setupDefinition,
  setupDefinitionWithBreakout,
} from "../../utils/__tests__/test-helpers";

import type { MetricIdentityEntry, MetricNameMap } from "./utils";
import {
  applyTrackedDefinitions,
  buildExpressionText,
  cleanupParens,
  filterSearchResults,
  findInvalidRanges,
  getWordAtCursor,
  parseFullText,
} from "./utils";

jest.mock("../../utils/definition-builder", () => ({
  getDefinitionName: (def: any) => def?.["display-name"] ?? null,
}));

function makeSearchResult(id: number, model: "metric" | "measure") {
  return { id, model, name: `Result ${id}` };
}

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
    count: 1,
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
  const metricNames: MetricNameMap = {
    "metric:1": "Revenue",
    "metric:2": "Costs",
  };

  const m = (sourceId: MetricSourceId): ExpressionSubToken => ({
    type: "metric",
    sourceId,
    count: 1,
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
      buildExpressionText([m("metric:1"), op("*"), k(0.85)], metricNames),
    ).toBe("Revenue * 0.85");
  });

  it("renders an integer constant", () => {
    expect(
      buildExpressionText([m("metric:1"), op("*"), k(100)], metricNames),
    ).toBe("Revenue * 100");
  });

  it("renders constants inside parentheses", () => {
    // (Revenue + Costs) * 0.85
    expect(
      buildExpressionText(
        [open, m("metric:1"), op("+"), m("metric:2"), close, op("*"), k(0.85)],
        metricNames,
      ),
    ).toBe("(Revenue + Costs) * 0.85");
  });

  it("renders a constant divided by a metric", () => {
    expect(
      buildExpressionText([k(1), op("/"), m("metric:1")], metricNames),
    ).toBe("1 / Revenue");
  });
});

// ---------------------------------------------------------------------------
// parseFullText — numeric literals
// ---------------------------------------------------------------------------

describe("parseFullText — numeric literal parsing", () => {
  const metricNames: MetricNameMap = {
    "metric:1": "Revenue",
    "metric:2": "Costs",
  };

  const m = (sourceId: MetricSourceId): ExpressionSubToken => ({
    type: "metric",
    sourceId,
    count: 1,
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
    const result = parseFullText("Revenue * 0.85", metricNames);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [m("metric:1"), op("*"), k(0.85)],
    });
  });

  it("parses a metric multiplied by an integer constant", () => {
    const result = parseFullText("Revenue * 100", metricNames);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [m("metric:1"), op("*"), k(100)],
    });
  });

  it("parses a constant on the left side", () => {
    const result = parseFullText("0.5 * Revenue", metricNames);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [k(0.5), op("*"), m("metric:1")],
    });
  });

  it("parses a constant inside parentheses — (Revenue + Costs) * 0.85", () => {
    const result = parseFullText("(Revenue + Costs) * 0.85", metricNames);
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
    const result = parseFullText("0.5 * Revenue + 0.5 * Costs", metricNames);
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
    const result = parseFullText("1 + Revenue", metricNames);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [k(1), op("+"), m("metric:1")],
    });
  });

  it("parses a leading-dot decimal like .5", () => {
    const result = parseFullText(".5 * Revenue", metricNames);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [k(0.5), op("*"), m("metric:1")],
    });
  });

  it("parses a metric multiplied by a leading-dot decimal", () => {
    const result = parseFullText("Revenue * .85", metricNames);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [m("metric:1"), op("*"), k(0.85)],
    });
  });

  it("parses a negative leading-dot decimal", () => {
    const result = parseFullText("-.5 * Revenue", metricNames);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [k(-0.5), op("*"), m("metric:1")],
    });
  });

  it("does not parse a trailing dot as part of the number", () => {
    // "1." — trailing dot with no digit after it; "1" is the constant, "." is
    // dropped (unknown tokens are filtered out of committed data)
    const result = parseFullText("1.", metricNames);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [k(1)],
    });
  });

  it("parses constants and metrics as separate items separated by a comma", () => {
    // "Revenue * 0.85, Costs"
    const result = parseFullText("Revenue * 0.85, Costs", metricNames);
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
    const result = parseFullText(text, metricNames);
    expect(result).toHaveLength(1);
    const entry = result[0];
    if (entry.type === "expression") {
      // eslint-disable-next-line jest/no-conditional-expect
      expect(buildExpressionText(entry.tokens, metricNames)).toBe(text);
    } else {
      throw new Error("Expected expression entry");
    }
  });
});

// ---------------------------------------------------------------------------
// parseFullText — negative numbers
// ---------------------------------------------------------------------------

describe("parseFullText — negative numbers", () => {
  const metricNames: MetricNameMap = {
    "metric:1": "Revenue",
    "metric:2": "Costs",
  };

  const metric = (sourceId: MetricSourceId): ExpressionSubToken => ({
    type: "metric",
    sourceId,
    count: 1,
  });
  const op = (o: "+" | "-" | "*" | "/"): ExpressionSubToken => ({
    type: "operator",
    op: o,
  });
  const constant = (v: number): ExpressionSubToken => ({
    type: "constant",
    value: v,
  });
  const open: ExpressionSubToken = { type: "open-paren" };
  const close: ExpressionSubToken = { type: "close-paren" };

  it("parses a standalone negative integer", () => {
    const result = parseFullText("-50", metricNames);
    expect(result).toEqual([
      {
        id: "expression:-50",
        type: "expression",
        name: "-50",
        tokens: [constant(-50)],
      },
    ]);
  });

  it("parses metric plus negative constant", () => {
    const result = parseFullText("Revenue + -50", metricNames);
    expect(result).toEqual([
      {
        id: "expression:Revenue + -50",
        type: "expression",
        name: "Revenue + -50",
        tokens: [metric("metric:1"), op("+"), constant(-50)],
      },
    ]);
  });

  it("parses metric multiplied by negative decimal", () => {
    const result = parseFullText("Revenue * -0.85", metricNames);
    expect(result).toEqual([
      {
        id: "expression:Revenue * -0.85",
        type: "expression",
        name: "Revenue * -0.85",
        tokens: [metric("metric:1"), op("*"), constant(-0.85)],
      },
    ]);
  });

  it("parses negative constant at the start of expression", () => {
    const result = parseFullText("-50 * Revenue", metricNames);
    expect(result).toEqual([
      {
        id: "expression:-50 * Revenue",
        type: "expression",
        name: "-50 * Revenue",
        tokens: [constant(-50), op("*"), metric("metric:1")],
      },
    ]);
  });

  it("parses negative constant after open-paren", () => {
    const result = parseFullText("(-50 + Revenue)", metricNames);
    expect(result).toEqual([
      {
        id: "expression:(-50 + Revenue)",
        type: "expression",
        name: "(-50 + Revenue)",
        tokens: [open, constant(-50), op("+"), metric("metric:1"), close],
      },
    ]);
  });

  it("parses subtraction of a negative constant", () => {
    const result = parseFullText("Revenue - -50", metricNames);
    expect(result).toEqual([
      {
        id: "expression:Revenue - -50",
        type: "expression",
        name: "Revenue - -50",
        tokens: [metric("metric:1"), op("-"), constant(-50)],
      },
    ]);
  });

  it("round-trips negative constants through buildExpressionText", () => {
    const text = "Revenue + -50";
    const result = parseFullText(text, metricNames);
    expect(result).toHaveLength(1);
    const entry = result[0];
    if (entry.type === "expression") {
      // eslint-disable-next-line jest/no-conditional-expect
      expect(buildExpressionText(entry.tokens, metricNames)).toBe(text);
    } else {
      throw new Error("Expected expression entry");
    }
  });

  it.each([
    "-50 * Revenue",
    "Revenue + -50",
    "Revenue - -50",
    "(-50 + Revenue)",
    "Revenue * -0.85",
  ])("does not report validation errors for: %s", (text) => {
    expect(findInvalidRanges(text, metricNames)).toEqual([]);
  });

  it("parses metric minus negative constant without spaces (Revenue--50)", () => {
    const result = parseFullText("Revenue--50", metricNames);
    expect(result).toEqual([
      {
        id: "expression:Revenue - -50",
        type: "expression",
        name: "Revenue - -50",
        tokens: [metric("metric:1"), op("-"), constant(-50)],
      },
    ]);
  });

  it("parses metric minus negative decimal without spaces (Revenue--0.5)", () => {
    const result = parseFullText("Revenue--0.5", metricNames);
    expect(result).toEqual([
      {
        id: "expression:Revenue - -0.5",
        type: "expression",
        name: "Revenue - -0.5",
        tokens: [metric("metric:1"), op("-"), constant(-0.5)],
      },
    ]);
  });

  it("does not report validation errors for Revenue--50", () => {
    expect(findInvalidRanges("Revenue--50", metricNames)).toEqual([]);
  });

  it("still treats minus as binary operator after a metric", () => {
    const result = parseFullText("Revenue - 50", metricNames);
    expect(result).toEqual([
      {
        id: "expression:Revenue - 50",
        type: "expression",
        name: "Revenue - 50",
        tokens: [metric("metric:1"), op("-"), constant(50)],
      },
    ]);
  });

  it("still treats minus as binary operator after a constant", () => {
    const result = parseFullText("100 - Revenue", metricNames);
    expect(result).toEqual([
      {
        id: "expression:100 - Revenue",
        type: "expression",
        name: "100 - Revenue",
        tokens: [constant(100), op("-"), metric("metric:1")],
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// parseFullText — metric names containing commas
// ---------------------------------------------------------------------------

describe("parseFullText — metric names with commas", () => {
  const m = (sourceId: MetricSourceId): ExpressionSubToken => ({
    type: "metric",
    sourceId,
    count: 1,
  });
  const op = (o: "+" | "-" | "*" | "/"): ExpressionSubToken => ({
    type: "operator",
    op: o,
  });
  const k = (v: number): ExpressionSubToken => ({
    type: "constant",
    value: v,
  });

  it("parses a single metric whose name contains a comma", () => {
    const names: MetricNameMap = {
      "metric:10": "Revenue, Total",
      "metric:2": "Costs",
    };
    const result = parseFullText("Revenue, Total", names);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: "metric", id: "metric:10" });
  });

  it("parses metric-with-comma followed by another metric", () => {
    const names: MetricNameMap = {
      "metric:10": "Revenue, Total",
      "metric:2": "Costs",
    };
    const result = parseFullText("Revenue, Total, Costs", names);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: "metric", id: "metric:10" });
    expect(result[1]).toMatchObject({ type: "metric", id: "metric:2" });
  });

  it("parses metric-with-comma in an expression", () => {
    const names: MetricNameMap = {
      "metric:10": "Revenue, Total",
      "metric:2": "Costs",
    };
    const result = parseFullText("Revenue, Total + Costs", names);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [m("metric:10"), op("+"), m("metric:2")],
    });
  });

  it("parses two metrics whose names each contain commas", () => {
    const names: MetricNameMap = {
      "metric:10": "Revenue, Total",
      "metric:11": "Costs, Annual",
    };
    const result = parseFullText("Revenue, Total, Costs, Annual", names);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: "metric", id: "metric:10" });
    expect(result[1]).toMatchObject({ type: "metric", id: "metric:11" });
  });

  it("prefers longer metric name over shorter one when both match", () => {
    // "Revenue, Total" should match as one metric, not "Revenue" + separator
    const names: MetricNameMap = {
      "metric:10": "Revenue, Total",
      "metric:1": "Revenue",
      "metric:2": "Costs",
    };
    const result = parseFullText("Revenue, Total, Costs", names);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: "metric", id: "metric:10" });
    expect(result[1]).toMatchObject({ type: "metric", id: "metric:2" });
  });

  it("falls back to shorter metric when longer does not match", () => {
    // Only "Revenue" is known, not "Revenue, Total"
    const names: MetricNameMap = { "metric:1": "Revenue", "metric:2": "Costs" };
    const result = parseFullText("Revenue, Costs", names);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: "metric", id: "metric:1" });
    expect(result[1]).toMatchObject({ type: "metric", id: "metric:2" });
  });

  it("handles metric-with-comma multiplied by a constant", () => {
    const names: MetricNameMap = { "metric:10": "Revenue, Total" };
    const result = parseFullText("Revenue, Total * 0.85", names);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [m("metric:10"), op("*"), k(0.85)],
    });
  });
});

// ---------------------------------------------------------------------------
// findInvalidRanges — unknown token detection
// ---------------------------------------------------------------------------

describe("findInvalidRanges — unknown token detection", () => {
  const metricNames: MetricNameMap = {
    "metric:1": "Revenue",
    "metric:2": "Costs",
  };

  it("returns no errors for valid expression", () => {
    expect(findInvalidRanges("Revenue + Costs", metricNames)).toEqual([]);
  });

  it("returns no errors for valid expression with constant", () => {
    expect(findInvalidRanges("Revenue * 0.85", metricNames)).toEqual([]);
  });

  it("flags a single unknown word", () => {
    const errors = findInvalidRanges("Revenue + xyz", metricNames);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      from: 10,
      to: 13,
      message: expect.stringContaining("xyz"),
    });
  });

  it("flags unknown text that is not a known metric", () => {
    const errors = findInvalidRanges("Foo", metricNames);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: expect.stringContaining("Foo"),
    });
  });

  it("flags multiple unknown tokens in different segments", () => {
    const errors = findInvalidRanges("abc, def", metricNames);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it("flags unknown token mixed with valid tokens", () => {
    const errors = findInvalidRanges("Revenue + unknown + Costs", metricNames);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: expect.stringContaining("unknown"),
    });
  });

  it("does not flag numbers as unknown", () => {
    expect(findInvalidRanges("Revenue * 100", metricNames)).toEqual([]);
  });

  it("does not flag parentheses as unknown", () => {
    expect(findInvalidRanges("(Revenue + Costs)", metricNames)).toEqual([]);
  });

  it("does not flag operators as unknown", () => {
    expect(findInvalidRanges("Revenue + Costs - Revenue", metricNames)).toEqual(
      [],
    );
  });

  it("flags unknown token at the start of expression", () => {
    const errors = findInvalidRanges("xyz + Revenue", metricNames);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      from: 0,
      to: 3,
      message: expect.stringContaining("xyz"),
    });
  });

  it("returns both structural and unknown errors", () => {
    // "xyz +" has an unknown token AND a trailing operator
    const errors = findInvalidRanges("xyz +", metricNames);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const messages = errors.map((e) => e.message);
    expect(messages.some((m) => m.includes("xyz"))).toBe(true);
    expect(messages.some((m) => m.includes("end with an operator"))).toBe(true);
  });

  it("flags trailing characters after a metric name with special chars", () => {
    const names: MetricNameMap = { "metric:99": "People Q H2 Orders, Count!" };
    const errors = findInvalidRanges("People Q H2 Orders, Count!!!!", names);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      from: 26,
      to: 29,
      message: expect.stringContaining("!!!"),
    });
  });
});

// ---------------------------------------------------------------------------
// findInvalidRanges — predecessor validation
// ---------------------------------------------------------------------------

describe("findInvalidRanges — predecessor validation", () => {
  const metricNames: MetricNameMap = {
    "metric:1": "Revenue",
    "metric:2": "Costs",
  };

  it("flags missing operator between metric and constant", () => {
    const errors = findInvalidRanges("Revenue 2", metricNames);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      from: 8,
      to: 9,
      message: expect.stringContaining("Missing operator"),
    });
  });

  it("flags missing operator between two metrics", () => {
    const errors = findInvalidRanges("Revenue Costs", metricNames);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      from: 8,
      to: 13,
      message: expect.stringContaining("Missing operator"),
    });
  });

  it("flags missing operator between constant and metric", () => {
    const errors = findInvalidRanges("2 Revenue", metricNames);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      from: 2,
      to: 9,
      message: expect.stringContaining("Missing operator"),
    });
  });

  it("flags missing operator between close-paren and metric", () => {
    const errors = findInvalidRanges("(Revenue + Costs) Revenue", metricNames);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      from: 18,
      to: 25,
      message: expect.stringContaining("Missing operator"),
    });
  });

  it("flags operator before closing parenthesis", () => {
    const errors = findInvalidRanges("(Revenue +)", metricNames);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      from: 10,
      to: 11,
      message: expect.stringContaining("closing parenthesis"),
    });
  });

  it("flags consecutive operators", () => {
    const errors = findInvalidRanges("Revenue + + Costs", metricNames);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    const messages = errors.map((e) => e.message);
    expect(messages.some((m) => m.includes("Missing operand"))).toBe(true);
  });

  it("flags operator after opening parenthesis", () => {
    const errors = findInvalidRanges("(+ Revenue)", metricNames);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    const messages = errors.map((e) => e.message);
    expect(messages.some((m) => m.includes("Missing operand"))).toBe(true);
  });

  it("flags empty parentheses", () => {
    const errors = findInvalidRanges("Revenue + ()", metricNames);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    const messages = errors.map((e) => e.message);
    expect(messages.some((m) => m.includes("Empty parentheses"))).toBe(true);
  });

  it("flags leading operator", () => {
    const errors = findInvalidRanges("+ Revenue", metricNames);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    const messages = errors.map((e) => e.message);
    expect(messages.some((m) => m.includes("Missing operand"))).toBe(true);
  });

  it("flags trailing operator", () => {
    const errors = findInvalidRanges("Revenue +", metricNames);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    const messages = errors.map((e) => e.message);
    expect(messages.some((m) => m.includes("end with an operator"))).toBe(true);
  });

  it("flags constants-only expression as missing metric", () => {
    const errors = findInvalidRanges("2 + 2", metricNames);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: expect.stringContaining("at least one metric"),
    });
  });

  it("flags unmatched opening parenthesis", () => {
    const errors = findInvalidRanges("(Revenue + Costs", metricNames);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      from: 0,
      to: 1,
      message: expect.stringContaining("Unmatched opening parenthesis"),
    });
  });

  it("flags unmatched closing parenthesis", () => {
    const errors = findInvalidRanges("Revenue + Costs)", metricNames);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      from: 15,
      to: 16,
      message: expect.stringContaining("Unmatched closing parenthesis"),
    });
  });

  it("accepts valid nested parentheses", () => {
    expect(findInvalidRanges("(2 * (Revenue + Costs))", metricNames)).toEqual(
      [],
    );
  });

  it("accepts close-paren followed by operator", () => {
    expect(findInvalidRanges("(Revenue + Costs) * 2", metricNames)).toEqual([]);
  });
});

describe("getWordAtCursor — comma handling with metric entries", () => {
  const commaMetricNames: MetricNameMap = { "metric:99": "Revenue, Total" };

  it("without entries, comma is always a delimiter", () => {
    const text = "Revenue, Total";
    // cursor at end
    const result = getWordAtCursor(text, text.length);
    expect(result.word).toBe("Total");
  });

  it("with entries, comma inside a known metric name is not a delimiter", () => {
    const text = "Revenue, Total";
    const result = getWordAtCursor(text, text.length, commaMetricNames);
    expect(result.word).toBe("Revenue, Total");
  });

  it("with entries, separator comma between two metrics is still a delimiter", () => {
    const text = "Revenue, Orders";
    // cursor at end (inside "Orders")
    const result = getWordAtCursor(text, text.length, {
      "metric:1": "Revenue",
      "metric:2": "Orders",
    });
    expect(result.word).toBe("Orders");
  });

  it("treats comma as part of metric name when typing a partial match", () => {
    // User is typing "Revenue, T" which is a prefix of "Revenue, Total"
    // The comma is NOT a separator because "Revenue" alone is not a known
    // metric in this set — the only known metric is "Revenue, Total".
    const text = "Revenue, T";
    const result = getWordAtCursor(text, text.length, commaMetricNames);
    expect(result.word).toBe("Revenue, T");
  });

  it("math-operator delimiters still work with metric entries", () => {
    const text = "Revenue, Total + 1";
    const result = getWordAtCursor(text, text.length, commaMetricNames);
    expect(result.word).toBe("1");
  });

  it("returns full metric name when cursor is in the middle", () => {
    const text = "Revenue, Total";
    // cursor after the comma+space (position 9, inside "Total")
    const result = getWordAtCursor(text, 9, commaMetricNames);
    expect(result.word).toBe("Revenue, Total");
  });
});

function sourceId(id: number): MetricSourceId {
  return `metric:${id}`;
}

function getExprTokenDefinitions(
  entities: MetricsViewerFormulaEntity[],
  entityIndex: number,
): (LibMetric.MetricDefinition | undefined)[] {
  const entity = entities[entityIndex];
  if (!isExpressionEntry(entity)) {
    return [];
  }
  return entity.tokens
    .filter((token) => token.type === "metric")
    .map((token) =>
      token.type === "metric" ? (token.definition ?? undefined) : undefined,
    );
}

let nextSlotIndex = 0;

function identity(
  metricSourceId: MetricSourceId,
  from: number,
  to: number,
  definition: MetricDefinitionEntry["definition"] = null,
  slotIndex: number = nextSlotIndex++,
): MetricIdentityEntry {
  return { sourceId: metricSourceId, from, to, definition, slotIndex };
}

describe("applyTrackedDefinitions", () => {
  beforeEach(() => {
    nextSlotIndex = 0;
  });

  const metricNames: MetricNameMap = {
    [sourceId(1)]: "Revenue",
    [sourceId(2)]: "Geo Revenue",
  };
  const metadata = createMetricMetadata([REVENUE_METRIC, GEO_METRIC]);
  const revenueDef = setupDefinition(metadata, REVENUE_METRIC.id);
  const revenueBreakoutDef = setupDefinitionWithBreakout(
    metadata,
    REVENUE_METRIC.id,
    0,
  );
  const geoBreakoutDef = setupDefinitionWithBreakout(
    metadata,
    GEO_METRIC.id,
    0,
  );

  it("returns empty array for empty inputs", () => {
    const result = applyTrackedDefinitions([], [], "", metricNames);
    expect(result.entities).toEqual([]);
    expect(result.slotMapping.size).toBe(0);
  });

  it("applies tracked definition to a standalone metric by position", () => {
    const text = "Revenue";
    const parsed = parseFullText(text, metricNames);
    const tracked = [identity(sourceId(1), 0, 7, revenueBreakoutDef)];
    const { entities } = applyTrackedDefinitions(
      parsed,
      tracked,
      text,
      metricNames,
    );
    expect(entities).toHaveLength(1);
    expect((entities[0] as MetricDefinitionEntry).definition).toBe(
      revenueBreakoutDef,
    );
  });

  it("preserves null definition when tracked identity has null", () => {
    const text = "Revenue";
    const parsed = parseFullText(text, metricNames);
    const tracked = [identity(sourceId(1), 0, 7, null)];
    const { entities } = applyTrackedDefinitions(
      parsed,
      tracked,
      text,
      metricNames,
    );
    expect((entities[0] as MetricDefinitionEntry).definition).toBeNull();
  });

  it("leaves entity unchanged when no tracked identity matches its position", () => {
    const text = "Revenue";
    const parsed = parseFullText(text, metricNames);
    const { entities } = applyTrackedDefinitions(parsed, [], text, metricNames);
    expect(entities).toEqual(parsed);
  });

  it("matches definitions by exact position for comma-separated metrics", () => {
    const text = "Revenue, Geo Revenue";
    const parsed = parseFullText(text, metricNames);
    const tracked = [
      identity(sourceId(1), 0, 7, revenueBreakoutDef),
      identity(sourceId(2), 9, 20, geoBreakoutDef),
    ];
    const { entities } = applyTrackedDefinitions(
      parsed,
      tracked,
      text,
      metricNames,
    );
    expect((entities[0] as MetricDefinitionEntry).definition).toBe(
      revenueBreakoutDef,
    );
    expect((entities[1] as MetricDefinitionEntry).definition).toBe(
      geoBreakoutDef,
    );
  });

  it("strips breakout projections from expression token definitions", () => {
    const text = "Revenue + 5";
    const parsed = parseFullText(text, metricNames);
    const tracked = [identity(sourceId(1), 0, 7, revenueBreakoutDef)];
    const { entities } = applyTrackedDefinitions(
      parsed,
      tracked,
      text,
      metricNames,
    );
    const [tokenDef] = getExprTokenDefinitions(entities, 0);
    expect(tokenDef).toBeDefined();
    expect(LibMetric.projections(tokenDef!)).toEqual([]);
  });

  it("preserves non-breakout definitions on expression tokens", () => {
    const text = "Revenue + 5";
    const parsed = parseFullText(text, metricNames);
    const tracked = [identity(sourceId(1), 0, 7, revenueDef)];
    const { entities } = applyTrackedDefinitions(
      parsed,
      tracked,
      text,
      metricNames,
    );
    const [tokenDef] = getExprTokenDefinitions(entities, 0);
    expect(tokenDef).toBe(revenueDef);
  });

  it("preserves reference identity for expression entries when no tokens change", () => {
    const text = "Revenue + 5";
    const parsed = parseFullText(text, metricNames);
    const { entities } = applyTrackedDefinitions(parsed, [], text, metricNames);
    expect(entities[0]).toBe(parsed[0]);
  });

  it("does not touch non-metric tokens inside expressions", () => {
    const text = "Revenue + 5";
    const parsed = parseFullText(text, metricNames);
    const tracked = [identity(sourceId(1), 0, 7, revenueDef)];
    const { entities } = applyTrackedDefinitions(
      parsed,
      tracked,
      text,
      metricNames,
    );
    const resultExpr = entities[0] as ExpressionDefinitionEntry;
    const parsedExpr = parsed[0] as ExpressionDefinitionEntry;
    expect(resultExpr.tokens[1]).toBe(parsedExpr.tokens[1]);
    expect(resultExpr.tokens[2]).toBe(parsedExpr.tokens[2]);
  });

  it("applies definition only to standalone metric, not expression token at different position", () => {
    const text = "Revenue, Revenue + 5";
    const parsed = parseFullText(text, metricNames);
    // Only the standalone Revenue (0-7) has a tracked identity
    const tracked = [identity(sourceId(1), 0, 7, revenueBreakoutDef)];
    const { entities } = applyTrackedDefinitions(
      parsed,
      tracked,
      text,
      metricNames,
    );
    expect((entities[0] as MetricDefinitionEntry).definition).toBe(
      revenueBreakoutDef,
    );
    const [tokenDef] = getExprTokenDefinitions(entities, 1);
    expect(tokenDef).toBeUndefined();
  });

  it("does not carry definition to a token at a non-matching position", () => {
    // Tracked identity at [100,107] — token was deleted (TrackDel).
    // New Revenue at [0,7] is a fresh instance, gets no override.
    const text = "Revenue";
    const parsed = parseFullText(text, metricNames);
    const tracked = [identity(sourceId(1), 100, 107, revenueDef)];
    const { entities } = applyTrackedDefinitions(
      parsed,
      tracked,
      text,
      metricNames,
    );
    expect((entities[0] as MetricDefinitionEntry).definition).not.toBe(
      revenueDef,
    );
  });

  it("newly added duplicate of same metric gets no definition from the tracked one", () => {
    const text = "Revenue, Revenue";
    const parsed = parseFullText(text, metricNames);
    // Only one tracked identity at position [0,7]
    const tracked = [identity(sourceId(1), 0, 7, revenueBreakoutDef)];
    const { entities } = applyTrackedDefinitions(
      parsed,
      tracked,
      text,
      metricNames,
    );
    // First Revenue at [0,7] — exact position match
    expect((entities[0] as MetricDefinitionEntry).definition).toBe(
      revenueBreakoutDef,
    );
    // Second Revenue at [9,16] — no match, independent new instance
    expect((entities[1] as MetricDefinitionEntry).definition).not.toBe(
      revenueBreakoutDef,
    );
  });

  it("preserves definition when token survives edit (position tracked by RangeSet)", () => {
    // "Revenue + 5" — Revenue token at [0,7] survived the edit
    const text = "Revenue + 5";
    const parsed = parseFullText(text, metricNames);
    const tracked = [identity(sourceId(1), 0, 7, revenueDef)];
    const { entities } = applyTrackedDefinitions(
      parsed,
      tracked,
      text,
      metricNames,
    );
    const [tokenDef] = getExprTokenDefinitions(entities, 0);
    expect(tokenDef).toBe(revenueDef);
  });

  it("two instances of same metric at different positions keep independent definitions", () => {
    const text = "Revenue, Revenue";
    const parsed = parseFullText(text, metricNames);
    const tracked = [
      identity(sourceId(1), 0, 7, revenueBreakoutDef, 0),
      identity(sourceId(1), 9, 16, revenueDef, 1),
    ];
    const { entities } = applyTrackedDefinitions(
      parsed,
      tracked,
      text,
      metricNames,
    );
    expect((entities[0] as MetricDefinitionEntry).definition).toBe(
      revenueBreakoutDef,
    );
    expect((entities[1] as MetricDefinitionEntry).definition).toBe(revenueDef);
  });
});
