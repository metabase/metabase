import type {
  ExpressionSubToken,
  MetricDefinitionEntry,
  MetricSourceId,
} from "../../types/viewer-state";

import {
  buildExpressionText,
  cleanupParens,
  filterSearchResults,
  findInvalidRanges,
  getWordAtCursor,
  parseFullText,
  reconcileBreakoutState,
} from "./utils";

jest.mock("../../utils/definition-builder", () => ({
  getDefinitionName: (def: any) => def?.["display-name"] ?? null,
}));

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
  const revenueEntry = makeMetricEntry("metric:1", "Revenue");
  const costsEntry = makeMetricEntry("metric:2", "Costs");
  const metricEntries = [revenueEntry, costsEntry];

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

  it("parses a leading-dot decimal like .5", () => {
    const result = parseFullText(".5 * Revenue", metricEntries);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [k(0.5), op("*"), m("metric:1")],
    });
  });

  it("parses a metric multiplied by a leading-dot decimal", () => {
    const result = parseFullText("Revenue * .85", metricEntries);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [m("metric:1"), op("*"), k(0.85)],
    });
  });

  it("parses a negative leading-dot decimal", () => {
    const result = parseFullText("-.5 * Revenue", metricEntries);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [k(-0.5), op("*"), m("metric:1")],
    });
  });

  it("does not parse a trailing dot as part of the number", () => {
    // "1." — trailing dot with no digit after it; "1" is the constant, "." is
    // dropped (unknown tokens are filtered out of committed data)
    const result = parseFullText("1.", metricEntries);
    expect(result).toHaveLength(1);
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

// ---------------------------------------------------------------------------
// parseFullText — negative numbers
// ---------------------------------------------------------------------------

describe("parseFullText — negative numbers", () => {
  const revenueEntry = makeMetricEntry("metric:1", "Revenue");
  const costsEntry = makeMetricEntry("metric:2", "Costs");
  const metricEntries = [revenueEntry, costsEntry];

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
    const result = parseFullText("-50", metricEntries);
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
    const result = parseFullText("Revenue + -50", metricEntries);
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
    const result = parseFullText("Revenue * -0.85", metricEntries);
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
    const result = parseFullText("-50 * Revenue", metricEntries);
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
    const result = parseFullText("(-50 + Revenue)", metricEntries);
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
    const result = parseFullText("Revenue - -50", metricEntries);
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

  it.each([
    "-50 * Revenue",
    "Revenue + -50",
    "Revenue - -50",
    "(-50 + Revenue)",
    "Revenue * -0.85",
  ])("does not report validation errors for: %s", (text) => {
    expect(findInvalidRanges(text, metricEntries)).toEqual([]);
  });

  it("parses metric minus negative constant without spaces (Revenue--50)", () => {
    const result = parseFullText("Revenue--50", metricEntries);
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
    const result = parseFullText("Revenue--0.5", metricEntries);
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
    expect(findInvalidRanges("Revenue--50", metricEntries)).toEqual([]);
  });

  it("still treats minus as binary operator after a metric", () => {
    const result = parseFullText("Revenue - 50", metricEntries);
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
    const result = parseFullText("100 - Revenue", metricEntries);
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
  const revTotalEntry = makeMetricEntry("metric:10", "Revenue, Total");
  const costsEntry = makeMetricEntry("metric:2", "Costs");
  const costsAnnualEntry = makeMetricEntry("metric:11", "Costs, Annual");
  const revenueEntry = makeMetricEntry("metric:1", "Revenue");

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
    const entries = [revTotalEntry, costsEntry];
    const result = parseFullText("Revenue, Total", entries);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: "metric", id: "metric:10" });
  });

  it("parses metric-with-comma followed by another metric", () => {
    const entries = [revTotalEntry, costsEntry];
    const result = parseFullText("Revenue, Total, Costs", entries);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: "metric", id: "metric:10" });
    expect(result[1]).toMatchObject({ type: "metric", id: "metric:2" });
  });

  it("parses metric-with-comma in an expression", () => {
    const entries = [revTotalEntry, costsEntry];
    const result = parseFullText("Revenue, Total + Costs", entries);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expression",
      tokens: [m("metric:10"), op("+"), m("metric:2")],
    });
  });

  it("parses two metrics whose names each contain commas", () => {
    const entries = [revTotalEntry, costsAnnualEntry];
    const result = parseFullText("Revenue, Total, Costs, Annual", entries);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: "metric", id: "metric:10" });
    expect(result[1]).toMatchObject({ type: "metric", id: "metric:11" });
  });

  it("prefers longer metric name over shorter one when both match", () => {
    // "Revenue, Total" should match as one metric, not "Revenue" + separator
    const entries = [revTotalEntry, revenueEntry, costsEntry];
    const result = parseFullText("Revenue, Total, Costs", entries);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: "metric", id: "metric:10" });
    expect(result[1]).toMatchObject({ type: "metric", id: "metric:2" });
  });

  it("falls back to shorter metric when longer does not match", () => {
    // Only "Revenue" is known, not "Revenue, Total"
    const entries = [revenueEntry, costsEntry];
    const result = parseFullText("Revenue, Costs", entries);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: "metric", id: "metric:1" });
    expect(result[1]).toMatchObject({ type: "metric", id: "metric:2" });
  });

  it("handles metric-with-comma multiplied by a constant", () => {
    const entries = [revTotalEntry];
    const result = parseFullText("Revenue, Total * 0.85", entries);
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
  const revenueEntry = makeMetricEntry("metric:1", "Revenue");
  const costsEntry = makeMetricEntry("metric:2", "Costs");
  const metricEntries = [revenueEntry, costsEntry];

  it("returns no errors for valid expression", () => {
    expect(findInvalidRanges("Revenue + Costs", metricEntries)).toEqual([]);
  });

  it("returns no errors for valid expression with constant", () => {
    expect(findInvalidRanges("Revenue * 0.85", metricEntries)).toEqual([]);
  });

  it("flags a single unknown word", () => {
    const errors = findInvalidRanges("Revenue + xyz", metricEntries);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      from: 10,
      to: 13,
      message: expect.stringContaining("xyz"),
    });
  });

  it("flags unknown text that is not a known metric", () => {
    const errors = findInvalidRanges("Foo", metricEntries);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: expect.stringContaining("Foo"),
    });
  });

  it("flags multiple unknown tokens in different segments", () => {
    const errors = findInvalidRanges("abc, def", metricEntries);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it("flags unknown token mixed with valid tokens", () => {
    const errors = findInvalidRanges(
      "Revenue + unknown + Costs",
      metricEntries,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: expect.stringContaining("unknown"),
    });
  });

  it("does not flag numbers as unknown", () => {
    expect(findInvalidRanges("Revenue * 100", metricEntries)).toEqual([]);
  });

  it("does not flag parentheses as unknown", () => {
    expect(findInvalidRanges("(Revenue + Costs)", metricEntries)).toEqual([]);
  });

  it("does not flag operators as unknown", () => {
    expect(
      findInvalidRanges("Revenue + Costs - Revenue", metricEntries),
    ).toEqual([]);
  });

  it("flags unknown token at the start of expression", () => {
    const errors = findInvalidRanges("xyz + Revenue", metricEntries);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      from: 0,
      to: 3,
      message: expect.stringContaining("xyz"),
    });
  });

  it("returns both structural and unknown errors", () => {
    // "xyz +" has an unknown token AND a trailing operator
    const errors = findInvalidRanges("xyz +", metricEntries);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const messages = errors.map((e) => e.message);
    expect(messages.some((m) => m.includes("xyz"))).toBe(true);
    expect(messages.some((m) => m.includes("end with an operator"))).toBe(true);
  });

  it("flags trailing characters after a metric name with special chars", () => {
    const entry = makeMetricEntry("metric:99", "People Q H2 Orders, Count!");
    const errors = findInvalidRanges("People Q H2 Orders, Count!!!!", [entry]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      from: 26,
      to: 29,
      message: expect.stringContaining("!!!"),
    });
  });
});

describe("getWordAtCursor — comma handling with metric entries", () => {
  const commaMetric = makeMetricEntry("metric:99", "Revenue, Total");

  it("without entries, comma is always a delimiter", () => {
    const text = "Revenue, Total";
    // cursor at end
    const result = getWordAtCursor(text, text.length);
    expect(result.word).toBe("Total");
  });

  it("with entries, comma inside a known metric name is not a delimiter", () => {
    const text = "Revenue, Total";
    const result = getWordAtCursor(text, text.length, [commaMetric]);
    expect(result.word).toBe("Revenue, Total");
  });

  it("with entries, separator comma between two metrics is still a delimiter", () => {
    const revenueEntry = makeMetricEntry("metric:1", "Revenue");
    const ordersEntry = makeMetricEntry("metric:2", "Orders");
    const text = "Revenue, Orders";
    // cursor at end (inside "Orders")
    const result = getWordAtCursor(text, text.length, [
      revenueEntry,
      ordersEntry,
    ]);
    expect(result.word).toBe("Orders");
  });

  it("treats comma as part of metric name when typing a partial match", () => {
    // User is typing "Revenue, T" which is a prefix of "Revenue, Total"
    // The comma is NOT a separator because "Revenue" alone is not a known
    // metric in this set — the only known metric is "Revenue, Total".
    const text = "Revenue, T";
    const result = getWordAtCursor(text, text.length, [commaMetric]);
    expect(result.word).toBe("Revenue, T");
  });

  it("math-operator delimiters still work with metric entries", () => {
    const text = "Revenue, Total + 1";
    const result = getWordAtCursor(text, text.length, [commaMetric]);
    expect(result.word).toBe("1");
  });

  it("returns full metric name when cursor is in the middle", () => {
    const text = "Revenue, Total";
    // cursor after the comma+space (position 9, inside "Total")
    const result = getWordAtCursor(text, 9, [commaMetric]);
    expect(result.word).toBe("Revenue, Total");
  });
});

describe("reconcileBreakoutState", () => {
  const breakoutDef = {
    "display-name": "MetricA",
    breakout: true,
  } as unknown as MetricDefinitionEntry["definition"];

  function metricEntry(
    sourceId: MetricSourceId,
    definition: MetricDefinitionEntry["definition"] = null,
  ): MetricDefinitionEntry {
    return { id: sourceId, type: "metric", definition };
  }

  it("preserves breakout definition from old entities onto matching new entities", () => {
    const oldEntities = [
      metricEntry("metric:1" as MetricSourceId, breakoutDef),
    ];
    const newEntities = [metricEntry("metric:1" as MetricSourceId)];

    const result = reconcileBreakoutState(newEntities, oldEntities);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("definition", breakoutDef);
  });

  it("does not add breakout to entities that had no breakout before", () => {
    const oldEntities = [metricEntry("metric:1" as MetricSourceId, null)];
    const newEntities = [metricEntry("metric:1" as MetricSourceId)];

    const result = reconcileBreakoutState(newEntities, oldEntities);
    expect(result[0]).toHaveProperty("definition", null);
  });

  it("matches by occurrence order for duplicate sourceIds", () => {
    const oldEntities = [
      metricEntry("metric:1" as MetricSourceId, breakoutDef),
      metricEntry("metric:1" as MetricSourceId, null),
    ];
    const newEntities = [
      metricEntry("metric:1" as MetricSourceId),
      metricEntry("metric:1" as MetricSourceId),
    ];

    const result = reconcileBreakoutState(newEntities, oldEntities);
    expect(result[0]).toHaveProperty("definition", breakoutDef);
    expect(result[1]).toHaveProperty("definition", null);
  });

  it("leaves extra new entities without breakout when old has fewer instances", () => {
    const oldEntities = [
      metricEntry("metric:1" as MetricSourceId, breakoutDef),
    ];
    const newEntities = [
      metricEntry("metric:1" as MetricSourceId),
      metricEntry("metric:1" as MetricSourceId),
    ];

    const result = reconcileBreakoutState(newEntities, oldEntities);
    expect(result[0]).toHaveProperty("definition", breakoutDef);
    expect(result[1]).toHaveProperty("definition", null);
  });

  it("ignores removed entities from old when new has fewer instances", () => {
    const oldEntities = [
      metricEntry("metric:1" as MetricSourceId, breakoutDef),
      metricEntry("metric:1" as MetricSourceId, breakoutDef),
    ];
    const newEntities = [metricEntry("metric:1" as MetricSourceId)];

    const result = reconcileBreakoutState(newEntities, oldEntities);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("definition", breakoutDef);
  });

  it("passes through expression entries unchanged", () => {
    const exprEntry = {
      id: "expression:MetricA + 5" as const,
      type: "expression" as const,
      name: "MetricA + 5",
      tokens: [] as ExpressionSubToken[],
    };
    const oldEntities = [
      metricEntry("metric:1" as MetricSourceId, breakoutDef),
      exprEntry,
    ];
    const newEntities = [
      metricEntry("metric:1" as MetricSourceId),
      { ...exprEntry },
    ];

    const result = reconcileBreakoutState(newEntities, oldEntities);
    expect(result[0]).toHaveProperty("definition", breakoutDef);
    expect(result[1]).toHaveProperty("type", "expression");
    expect(result[1]).not.toHaveProperty("definition");
  });

  it("handles new entities with no matching old entities", () => {
    const oldEntities = [
      metricEntry("metric:1" as MetricSourceId, breakoutDef),
    ];
    const newEntities = [
      metricEntry("metric:1" as MetricSourceId),
      metricEntry("metric:2" as MetricSourceId),
    ];

    const result = reconcileBreakoutState(newEntities, oldEntities);
    expect(result[0]).toHaveProperty("definition", breakoutDef);
    expect(result[1]).toHaveProperty("definition", null);
  });
});
