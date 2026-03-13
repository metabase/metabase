import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import type { ExpressionToken } from "../../../types/operators";
import type {
  MetricsViewerDefinitionEntry,
  SelectedMetric,
  SourceColorMap,
} from "../../../types/viewer-state";
import { createMetricSourceId } from "../../../utils/source-ids";

import { MetricSearchInput } from "./MetricSearchInput";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("../MetricPill", () => ({
  MetricPill: ({
    metric,
    onRemove,
  }: {
    metric: SelectedMetric;
    onRemove: (id: number, sourceType: "metric" | "measure") => void;
  }) => (
    <div data-testid="metric-pill" data-metric-name={metric.name}>
      <span>{metric.name}</span>
      <button onClick={() => onRemove(metric.id, metric.sourceType)}>
        remove
      </button>
    </div>
  ),
}));

jest.mock("../MetricExpressionPill", () => ({
  MetricExpressionPill: ({
    expressionText,
    onRemove,
  }: {
    expressionText: string;
    onRemove: () => void;
  }) => (
    <div
      data-testid="metric-expression-pill"
      data-expression-text={expressionText}
    >
      <span>{expressionText}</span>
      <button onClick={onRemove}>remove</button>
    </div>
  ),
}));

jest.mock("../MetricSearchDropdown", () => ({
  MetricSearchDropdown: ({
    onSelect,
    externalSearchText,
  }: {
    onSelect: (metric: SelectedMetric) => void;
    externalSearchText: string;
  }) => (
    <div data-testid="search-dropdown" data-search-text={externalSearchText}>
      <button
        onClick={() =>
          onSelect({ id: 99, name: "New Metric", sourceType: "metric" })
        }
      >
        select-new-metric
      </button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMetric(
  id: number,
  name: string,
  sourceType: "metric" | "measure" = "metric",
): SelectedMetric {
  return { id, name, sourceType };
}

function makeEntry(metric: SelectedMetric): MetricsViewerDefinitionEntry {
  const sid =
    metric.sourceType === "metric"
      ? createMetricSourceId(metric.id)
      : (`measure:${metric.id}` as const);
  return { id: sid, definition: null };
}

type SetupOptions = {
  tokens?: ExpressionToken[];
  selectedMetrics?: SelectedMetric[];
  metricColors?: SourceColorMap;
  definitions?: MetricsViewerDefinitionEntry[];
  onTokensChange?: jest.Mock;
  onAddMetric?: jest.Mock;
  onRemoveMetric?: jest.Mock;
  onSwapMetric?: jest.Mock;
  onSetBreakout?: jest.Mock;
};

function setup(options: SetupOptions = {}) {
  const revenue = makeMetric(1, "Revenue");
  const costs = makeMetric(2, "Costs");

  const {
    tokens = [],
    selectedMetrics = [revenue, costs],
    metricColors = {},
    definitions = selectedMetrics.map(makeEntry),
    onTokensChange = jest.fn(),
    onAddMetric = jest.fn(),
    onRemoveMetric = jest.fn(),
    onSwapMetric = jest.fn(),
    onSetBreakout = jest.fn(),
  } = options;

  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

  renderWithProviders(
    <MetricSearchInput
      tokens={tokens}
      onTokensChange={onTokensChange}
      selectedMetrics={selectedMetrics}
      metricColors={metricColors}
      definitions={definitions}
      onAddMetric={onAddMetric}
      onRemoveMetric={onRemoveMetric}
      onSwapMetric={onSwapMetric}
      onSetBreakout={onSetBreakout}
    />,
  );

  return {
    user,
    onTokensChange,
    onAddMetric,
    onRemoveMetric,
    onSwapMetric,
    onSetBreakout,
  };
}

// ---------------------------------------------------------------------------
// Token factories
// ---------------------------------------------------------------------------

const m = (idx: number): ExpressionToken => ({
  type: "metric",
  metricIndex: idx,
});
const op = (o: "+" | "-" | "*" | "/"): ExpressionToken => ({
  type: "operator",
  op: o,
});
const k = (v: number): ExpressionToken => ({ type: "constant", value: v });
const sep: ExpressionToken = { type: "separator" };
const openP: ExpressionToken = { type: "open-paren" };
const closeP: ExpressionToken = { type: "close-paren" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// ── Collapsed view (pills) ──────────────────────────────────────────────────

describe("collapsed view (tokens present, not focused)", () => {
  it("renders a single metric token as a MetricPill", () => {
    setup({ tokens: [m(0)] });

    expect(screen.getByTestId("metric-pill")).toBeInTheDocument();
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders an expression item as MetricExpressionPill", () => {
    setup({ tokens: [m(0), op("+"), m(1)] });

    const pill = screen.getByTestId("metric-expression-pill");
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute("data-expression-text", "Revenue + Costs");
    expect(screen.queryByTestId("metric-pill")).not.toBeInTheDocument();
  });

  it("renders an expression with a numeric constant as MetricExpressionPill", () => {
    setup({
      tokens: [openP, m(0), op("+"), m(1), closeP, op("*"), k(0.85)],
    });

    const pill = screen.getByTestId("metric-expression-pill");
    expect(pill).toHaveAttribute(
      "data-expression-text",
      "(Revenue + Costs) * 0.85",
    );
  });

  it("renders two separate items as two pills", () => {
    // item 1: m(0)  item 2: m(1)
    setup({ tokens: [m(0), sep, m(1)] });

    const pills = screen.getAllByTestId("metric-pill");
    expect(pills).toHaveLength(2);
    expect(pills[0]).toHaveAttribute("data-metric-name", "Revenue");
    expect(pills[1]).toHaveAttribute("data-metric-name", "Costs");
  });

  it("renders a mixed expression + standalone metric as expression pill and metric pill", () => {
    // item 1: Revenue + Costs  item 2: Revenue (standalone metric)
    setup({ tokens: [m(0), op("+"), m(1), sep, m(0)] });

    expect(screen.getByTestId("metric-expression-pill")).toBeInTheDocument();
    expect(screen.getByTestId("metric-pill")).toBeInTheDocument();
  });

  it("does not render a text input when collapsed", () => {
    setup({ tokens: [m(0)] });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows placeholder text when there are no tokens and no focus", () => {
    setup({ tokens: [] });
    // The input is rendered but unfocused with empty tokens
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("placeholder", "Search for metrics...");
  });
});

// ── Expanded view (focused text input) ─────────────────────────────────────

describe("expanded view (focused text input)", () => {
  it("transitions to text input when clicking the container", async () => {
    const { user } = setup({ tokens: [m(0)] });

    // Click the container (the metric pill area) to focus
    await user.click(screen.getByTestId("metric-pill"));

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });
  });

  it("shows full expression text in the text input when focused", async () => {
    const { user } = setup({ tokens: [m(0), op("+"), m(1)] });

    await user.click(screen.getByTestId("metric-expression-pill"));

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("Revenue + Costs");
    });
  });

  it("shows multiple items as comma-separated text in the input", async () => {
    const { user } = setup({ tokens: [m(0), sep, m(1)] });

    // Click the first pill to focus
    const pills = screen.getAllByTestId("metric-pill");
    await user.click(pills[0]);

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("Revenue, Costs");
    });
  });

  it("shows the expression with constant in text input", async () => {
    const { user } = setup({
      tokens: [openP, m(0), op("+"), m(1), closeP, op("*"), k(0.85)],
    });

    await user.click(screen.getByTestId("metric-expression-pill"));

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue(
        "(Revenue + Costs) * 0.85",
      );
    });
  });

  it("opens the search dropdown when the input is focused", async () => {
    const { user } = setup({ tokens: [] });

    const input = screen.getByRole("textbox");
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByTestId("search-dropdown")).toBeInTheDocument();
    });
  });
});

// ── Blur / unfocus behavior ─────────────────────────────────────────────────

describe("blur behavior", () => {
  it("returns to collapsed view after blur (after 150ms timeout)", async () => {
    const { user } = setup({ tokens: [m(0), op("+"), m(1)] });

    await user.click(screen.getByTestId("metric-expression-pill"));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();

    // Blur the input
    await user.tab();
    jest.advanceTimersByTime(200);

    await waitFor(() => {
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByTestId("metric-expression-pill")).toBeInTheDocument();
    });
  });

  it("calls onTokensChange on blur with parsed tokens", async () => {
    const onTokensChange = jest.fn();
    const { user } = setup({
      tokens: [m(0), op("+"), m(1)],
      onTokensChange,
    });

    await user.click(screen.getByTestId("metric-expression-pill"));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();

    // Clear and re-type a simpler expression
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Revenue");

    await user.tab();
    jest.advanceTimersByTime(200);

    await waitFor(() => {
      expect(onTokensChange).toHaveBeenCalled();
    });
  });

  it("removes unreferenced metrics from selectedMetrics on blur", async () => {
    const onRemoveMetric = jest.fn();
    const { user } = setup({
      tokens: [m(0), op("+"), m(1)],
      onRemoveMetric,
    });

    await user.click(screen.getByTestId("metric-expression-pill"));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();

    // Edit to only reference Revenue, removing Costs
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Revenue");

    await user.tab();
    jest.advanceTimersByTime(200);

    await waitFor(() => {
      // Costs (index 1) should be removed
      expect(onRemoveMetric).toHaveBeenCalledWith(2, "metric");
    });
  });

  it("discards empty items (trailing separators) on blur via cleanupSeparators", async () => {
    const onTokensChange = jest.fn();
    const revenue = makeMetric(1, "Revenue");
    const { user } = setup({
      tokens: [m(0)],
      selectedMetrics: [revenue],
      definitions: [makeEntry(revenue)],
      onTokensChange,
    });

    await user.click(screen.getByTestId("metric-pill"));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();

    // Type a trailing comma — results in an empty second item
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Revenue,");

    await user.tab();
    jest.advanceTimersByTime(200);

    await waitFor(() => {
      const lastCall =
        onTokensChange.mock.calls[onTokensChange.mock.calls.length - 1][0];
      // Should not have a trailing separator
      expect(lastCall[lastCall.length - 1]?.type).not.toBe("separator");
    });
  });
});

// ── Removing items ──────────────────────────────────────────────────────────

describe("removing pills", () => {
  it("calls onRemoveMetric and onTokensChange when removing a standalone MetricPill", async () => {
    const onRemoveMetric = jest.fn();
    const onTokensChange = jest.fn();
    const { user } = setup({
      tokens: [m(0)],
      onRemoveMetric,
      onTokensChange,
    });

    await user.click(screen.getByRole("button", { name: "remove" }));

    expect(onRemoveMetric).toHaveBeenCalledWith(1, "metric");
    expect(onTokensChange).toHaveBeenCalledWith([]);
  });

  it("removes a MetricPill from a two-item list, keeping the other metric", async () => {
    const onRemoveMetric = jest.fn();
    const onTokensChange = jest.fn();
    const { user } = setup({
      tokens: [m(0), sep, m(1)],
      onRemoveMetric,
      onTokensChange,
    });

    const removeButtons = screen.getAllByRole("button", { name: "remove" });
    // Remove the first item (Revenue)
    await user.click(removeButtons[0]);

    expect(onRemoveMetric).toHaveBeenCalledWith(1, "metric");
    // Costs remains as m(0) after re-indexing
    expect(onTokensChange).toHaveBeenCalledWith([
      { type: "metric", metricIndex: 0 },
    ]);
  });

  it("calls onRemoveMetric for all metrics in an expression pill when removed", async () => {
    const onRemoveMetric = jest.fn();
    const onTokensChange = jest.fn();
    const { user } = setup({
      tokens: [m(0), op("+"), m(1)],
      onRemoveMetric,
      onTokensChange,
    });

    await user.click(screen.getByRole("button", { name: "remove" }));

    // Both Revenue (id 1) and Costs (id 2) should be removed
    expect(onRemoveMetric).toHaveBeenCalledWith(1, "metric");
    expect(onRemoveMetric).toHaveBeenCalledWith(2, "metric");
    expect(onTokensChange).toHaveBeenCalledWith([]);
  });

  it("only removes metrics not still referenced in other items", async () => {
    // item 1: Revenue + Costs  item 2: Revenue (standalone)
    // Removing item 1 should only remove Costs (Revenue is still in item 2)
    const onRemoveMetric = jest.fn();
    const onTokensChange = jest.fn();
    const { user } = setup({
      tokens: [m(0), op("+"), m(1), sep, m(0)],
      onRemoveMetric,
      onTokensChange,
    });

    const removeButtons = screen.getAllByRole("button", { name: "remove" });
    // First button belongs to the expression pill
    await user.click(removeButtons[0]);

    // Only Costs (id 2, index 1) should be removed — Revenue is still referenced
    expect(onRemoveMetric).toHaveBeenCalledWith(2, "metric");
    expect(onRemoveMetric).not.toHaveBeenCalledWith(1, "metric");
  });
});

// ── Typing / onChange ───────────────────────────────────────────────────────

describe("typing in the text input", () => {
  it("calls onTokensChange as the user types", async () => {
    const onTokensChange = jest.fn();
    const { user } = setup({
      tokens: [],
      onTokensChange,
    });

    const input = screen.getByRole("textbox");
    await user.type(input, "R");

    expect(onTokensChange).toHaveBeenCalled();
  });

  it("opens the search dropdown on input", async () => {
    const { user } = setup({ tokens: [] });

    const input = screen.getByRole("textbox");
    await user.type(input, "Rev");

    expect(screen.getByTestId("search-dropdown")).toBeInTheDocument();
    expect(screen.getByTestId("search-dropdown")).toHaveAttribute(
      "data-search-text",
      "Rev",
    );
  });

  it("passes the word at cursor as the dropdown search text", async () => {
    const { user } = setup({ tokens: [m(0), op("+"), m(1)] });

    // Click into focused mode
    await user.click(screen.getByTestId("metric-expression-pill"));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Revenue + Co");

    // "Co" is the partial word at the cursor
    expect(screen.getByTestId("search-dropdown")).toHaveAttribute(
      "data-search-text",
      "Co",
    );
  });
});

// ── Auto-comma (metric selection from dropdown) ──────────────────────────────

describe("auto-comma on metric selection", () => {
  it("inserts a separator token when selecting a metric after a close-paren", async () => {
    const onTokensChange = jest.fn();
    const onAddMetric = jest.fn();

    const { user } = setup({
      tokens: [m(0), op("+"), m(1)],
      onTokensChange,
      onAddMetric,
    });

    // Enter focus mode — input shows "Revenue + Costs"
    await user.click(screen.getByTestId("metric-expression-pill"));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();

    // Type ")" to place the cursor just after a closing-paren. This positions
    // getWordAtCursor so textBeforeWord ends with ")", triggering auto-comma
    // when the next metric is selected.
    const input = screen.getByRole("textbox");
    await user.type(input, ")");

    expect(await screen.findByTestId("search-dropdown")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "select-new-metric" }));

    // onAddMetric should have been called
    expect(onAddMetric).toHaveBeenCalledWith(
      expect.objectContaining({ id: 99, name: "New Metric" }),
    );

    // The final onTokensChange call should contain a separator token
    const calls = onTokensChange.mock.calls;
    const lastTokens = calls[calls.length - 1][0] as ExpressionToken[];
    const hasSeparator = lastTokens.some((t) => t.type === "separator");
    expect(hasSeparator).toBe(true);
  });

  it("does not insert extra comma when selecting after an operator", async () => {
    const onTokensChange = jest.fn();
    const onAddMetric = jest.fn();
    const { user } = setup({
      tokens: [m(0), op("+")],
      onTokensChange,
      onAddMetric,
    });

    // Enter focus mode
    await user.click(screen.getByTestId("metric-expression-pill"));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();

    // Click the input to open the dropdown
    await user.click(screen.getByRole("textbox"));
    expect(await screen.findByTestId("search-dropdown")).toBeInTheDocument();

    // The input now shows "Revenue +" — clicking select should NOT insert a separator
    await user.click(screen.getByRole("button", { name: "select-new-metric" }));

    const calls = onTokensChange.mock.calls;
    const lastTokens = calls[calls.length - 1][0] as ExpressionToken[];
    const hasSeparator = lastTokens.some((t) => t.type === "separator");
    expect(hasSeparator).toBe(false);
  });
});

// ── Cleanup effects (paren cleanup, out-of-range tokens) ────────────────────

describe("cleanup effects when not focused", () => {
  it("removes unnecessary single-metric parentheses on re-render", async () => {
    // (Revenue) → Revenue
    const onTokensChange = jest.fn();
    setup({
      tokens: [
        { type: "open-paren" },
        m(0),
        { type: "close-paren" },
      ] as ExpressionToken[],
      onTokensChange,
    });

    await waitFor(() => {
      const calls = onTokensChange.mock.calls;
      if (calls.length > 0) {
        return Promise.resolve();
      }
    });

    const calls = onTokensChange.mock.calls;
    const lastTokens = calls[calls.length - 1][0] as ExpressionToken[];
    expect(lastTokens.some((t) => t.type === "open-paren")).toBe(false);
  });

  it("removes out-of-range metric tokens on re-render", async () => {
    // If selectedMetrics has 1 entry but token references index 1 → drop it
    const onTokensChange = jest.fn();
    const revenue = makeMetric(1, "Revenue");
    setup({
      tokens: [m(0), sep, m(1)], // index 1 is out of range
      selectedMetrics: [revenue],
      definitions: [makeEntry(revenue)],
      onTokensChange,
    });

    await waitFor(() => {
      expect(onTokensChange).toHaveBeenCalledWith(
        expect.arrayContaining([{ type: "metric", metricIndex: 0 }]),
      );
    });
  });
});
