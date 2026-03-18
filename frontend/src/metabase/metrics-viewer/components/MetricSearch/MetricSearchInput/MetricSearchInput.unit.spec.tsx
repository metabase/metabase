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
  return { id: sid, type: "metric" as const, definition: null };
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

  it("shows the CodeMirror editor when there are no tokens", () => {
    setup({ tokens: [] });
    // With empty tokens the editor is always shown (not collapsed to pills)
    expect(
      screen.getByTestId("metrics-viewer-search-input"),
    ).toBeInTheDocument();
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

  it("shows the text editor when focused (transitions from pills)", async () => {
    const { user } = setup({ tokens: [m(0), op("+"), m(1)] });

    await user.click(screen.getByTestId("metric-expression-pill"));

    await waitFor(() => {
      expect(
        screen.getByTestId("metrics-viewer-search-input"),
      ).toBeInTheDocument();
    });
  });

  it("shows multiple items editor when focused", async () => {
    const { user } = setup({ tokens: [m(0), sep, m(1)] });

    // Click the first pill to focus
    const pills = screen.getAllByTestId("metric-pill");
    await user.click(pills[0]);

    await waitFor(() => {
      expect(
        screen.getByTestId("metrics-viewer-search-input"),
      ).toBeInTheDocument();
    });
  });

  it("shows the expression with constant in text editor", async () => {
    const { user } = setup({
      tokens: [openP, m(0), op("+"), m(1), closeP, op("*"), k(0.85)],
    });

    await user.click(screen.getByTestId("metric-expression-pill"));

    await waitFor(() => {
      expect(
        screen.getByTestId("metrics-viewer-search-input"),
      ).toBeInTheDocument();
    });
  });

  it("opens the search dropdown when typing in the editor", async () => {
    const { user } = setup({ tokens: [] });

    const input = screen.getByTestId("metrics-viewer-search-input");
    await user.type(input, "R");

    await waitFor(() => {
      expect(screen.getByTestId("search-dropdown")).toBeInTheDocument();
    });
  });
});

// ── Blur / unfocus behavior ─────────────────────────────────────────────────

describe("blur behavior", () => {
  it("collapses back to pill view on blur when text is unchanged", async () => {
    const revenue = makeMetric(1, "Revenue");
    const { user } = setup({
      tokens: [m(0)],
      selectedMetrics: [revenue],
      definitions: [makeEntry(revenue)],
    });

    // Click pill to enter focused mode
    await user.click(screen.getByTestId("metric-pill"));
    await waitFor(() => {
      expect(
        screen.getByTestId("metrics-viewer-search-input"),
      ).toBeInTheDocument();
    });

    // Blur without editing — should collapse back to pill view
    await user.tab();

    // Editor should no longer be visible, pill should be back
    expect(
      screen.queryByTestId("metrics-viewer-search-input"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("metric-pill")).toBeInTheDocument();
  });

  it("stays focused after blur when formula is invalid", async () => {
    const { user } = setup({ tokens: [m(0), op("+"), m(1)] });

    await user.click(screen.getByTestId("metric-expression-pill"));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();

    // Type an invalid expression (trailing operator)
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Revenue +");

    await user.tab();

    // Invalid formula — should stay in focused mode with error state
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByTestId("metrics-formula-input")).toHaveAttribute(
      "data-has-error",
    );
  });

  it("does not collapse or commit on blur when formula is valid", async () => {
    const onTokensChange = jest.fn();
    const { user } = setup({
      tokens: [m(0), op("+"), m(1)],
      onTokensChange,
    });

    await user.click(screen.getByTestId("metric-expression-pill"));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();

    // Change to a different valid expression
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Revenue");

    await user.tab();

    // Valid formula — should stay in editing mode (only Run commits)
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    // onTokensChange should NOT have been called — blur does not commit
    expect(onTokensChange).not.toHaveBeenCalled();
  });

  it("shows the Run button when formula is dirty", async () => {
    const { user } = setup({ tokens: [m(0), op("+"), m(1)] });

    await user.click(screen.getByTestId("metric-expression-pill"));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();

    // Edit the text to make it dirty
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Revenue");

    expect(screen.getByTestId("run-expression-button")).toBeInTheDocument();
  });

  it("does not show the Run button when focused if formula is unchanged", async () => {
    const { user } = setup({ tokens: [m(0), op("+"), m(1)] });

    await user.click(screen.getByTestId("metric-expression-pill"));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();

    // Run button should NOT be visible when formula hasn't changed
    expect(
      screen.queryByTestId("run-expression-button"),
    ).not.toBeInTheDocument();
  });

  it("collapses back to pills on blur when formula is unchanged", async () => {
    const onTokensChange = jest.fn();
    const { user } = setup({
      tokens: [m(0), op("+"), m(1)],
      onTokensChange,
    });

    await user.click(screen.getByTestId("metric-expression-pill"));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();

    // Blur without changing text
    await user.tab();

    // Should collapse back to pill view
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByTestId("metric-expression-pill")).toBeInTheDocument();
    // onTokensChange should NOT have been called
    expect(onTokensChange).not.toHaveBeenCalled();
  });
});

// ── Run button and validation ───────────────────────────────────────────────

describe("run button and validation", () => {
  it("collapses and commits when Run is clicked with a valid expression", async () => {
    const onTokensChange = jest.fn();
    const { user } = setup({
      tokens: [m(0), op("+"), m(1)],
      onTokensChange,
    });

    await user.click(screen.getByTestId("metric-expression-pill"));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();

    // Edit to a valid but different expression
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Revenue");

    const runButton = screen.getByTestId("run-expression-button");
    await user.click(runButton);

    // Should collapse back to pills
    await waitFor(() => {
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });
  });

  it("removes unreferenced metrics when Run commits a valid expression", async () => {
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

    await user.click(screen.getByTestId("run-expression-button"));

    await waitFor(() => {
      // Costs (id 2) should be removed
      expect(onRemoveMetric).toHaveBeenCalledWith(2, "metric");
    });
  });

  it("shows a validation error for consecutive operators", async () => {
    const { user } = setup({ tokens: [m(0), op("+"), m(1)] });

    await user.click(screen.getByTestId("metric-expression-pill"));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Revenue + *");

    await user.click(screen.getByTestId("run-expression-button"));

    // Should set error state and NOT collapse
    expect(screen.getByTestId("metrics-formula-input")).toHaveAttribute(
      "data-has-error",
    );
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("shows a validation error for unmatched parentheses", async () => {
    const { user } = setup({ tokens: [m(0)] });

    await user.click(screen.getByTestId("metric-pill"));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "(Revenue + Costs");

    await user.click(screen.getByTestId("run-expression-button"));

    expect(screen.getByTestId("metrics-formula-input")).toHaveAttribute(
      "data-has-error",
    );
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("clears validation error when user types after an error", async () => {
    const { user } = setup({ tokens: [m(0), op("+"), m(1)] });

    await user.click(screen.getByTestId("metric-expression-pill"));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Revenue +");

    await user.click(screen.getByTestId("run-expression-button"));

    expect(screen.getByTestId("metrics-formula-input")).toHaveAttribute(
      "data-has-error",
    );

    // Type more to fix the expression
    await user.type(input, " Costs");

    expect(screen.getByTestId("metrics-formula-input")).not.toHaveAttribute(
      "data-has-error",
    );
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
  it("does not call onTokensChange as the user types (deferred to Run)", async () => {
    const onTokensChange = jest.fn();
    const { user } = setup({
      tokens: [],
      onTokensChange,
    });

    const input = screen.getByRole("textbox");
    await user.type(input, "R");

    // onTokensChange should NOT be called during typing — only on Run
    expect(onTokensChange).not.toHaveBeenCalled();
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
  it("inserts a comma in the text when selecting a metric after a close-paren", async () => {
    const onAddMetric = jest.fn();

    const { user } = setup({
      tokens: [m(0), op("+"), m(1)],
      onAddMetric,
    });

    // Enter focus mode — input shows "Revenue + Costs"
    await user.click(screen.getByTestId("metric-expression-pill"));
    await waitFor(() => {
      expect(
        screen.getByTestId("metrics-viewer-search-input"),
      ).toBeInTheDocument();
    });

    // Type ")" to place the cursor just after a closing-paren. This positions
    // getWordAtCursor so textBeforeWord ends with ")", triggering auto-comma
    // when the next metric is selected.
    const input = screen.getByTestId("metrics-viewer-search-input");
    await user.type(input, ")");

    expect(await screen.findByTestId("search-dropdown")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "select-new-metric" }));

    // onAddMetric should have been called
    expect(onAddMetric).toHaveBeenCalledWith(
      expect.objectContaining({ id: 99, name: "New Metric" }),
    );

    // The editor text should contain a comma (auto-inserted separator)
    await waitFor(() => {
      const editorText = screen.getByRole("textbox").textContent ?? "";
      expect(editorText).toContain(", New Metric");
    });
  });

  it("does not insert extra comma when selecting after an operator", async () => {
    const onAddMetric = jest.fn();
    const { user } = setup({
      tokens: [],
      onAddMetric,
    });

    // Type an expression ending with an operator to set up the cursor position
    const input = screen.getByTestId("metrics-viewer-search-input");
    await user.type(input, "Revenue + ");

    expect(await screen.findByTestId("search-dropdown")).toBeInTheDocument();

    // Select a metric — should NOT insert a comma since last char is "+"
    await user.click(screen.getByRole("button", { name: "select-new-metric" }));

    // The editor text should NOT contain a comma before the new metric
    await waitFor(() => {
      const editorText = screen.getByRole("textbox").textContent ?? "";
      expect(editorText).not.toContain(",");
    });
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
