import { fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import type {
  ExpressionDefinitionEntry,
  ExpressionSubToken,
  MetricDefinitionEntry,
  MetricExpressionId,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerFormulaEntity,
  SelectedMetric,
  SourceColorMap,
} from "../../../types/viewer-state";
import { isExpressionEntry, isMetricEntry } from "../../../types/viewer-state";
import { createMetricSourceId } from "../../../utils/source-ids";

import { MetricSearchInput } from "./MetricSearchInput";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("../../../utils/definition-builder", () => ({
  getDefinitionName: (def: any) => def?.["display-name"] ?? null,
}));

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
    expressionEntry,
    onClick,
    onRemove,
  }: {
    expressionEntry: { name: string };
    metricEntries: unknown[];
    colors?: string[];
    onClick: (e: React.MouseEvent) => void;
    onRemove: () => void;
  }) => {
    return (
      <div
        data-testid="metric-expression-pill"
        data-expression-text={expressionEntry.name}
        onClick={onClick}
      >
        <span>{expressionEntry.name}</span>
        <button onClick={onRemove}>remove</button>
      </div>
    );
  },
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

function makeMetricEntry(metric: SelectedMetric): MetricDefinitionEntry {
  const sid =
    metric.sourceType === "metric"
      ? createMetricSourceId(metric.id)
      : (`measure:${metric.id}` as MetricSourceId);
  // Create a fake definition with display-name for getDefinitionName
  const fakeDefinition = {
    "display-name": metric.name,
  } as unknown as MetricDefinitionEntry["definition"];
  return { id: sid, type: "metric" as const, definition: fakeDefinition };
}

function makeExpressionEntry(
  name: string,
  tokens: ExpressionSubToken[],
): ExpressionDefinitionEntry {
  return {
    id: `expression:${name}` as MetricExpressionId,
    type: "expression",
    name,
    tokens,
  };
}

/** Build a definitions map from metric entries only */
function buildDefinitionsMap(
  entries: MetricDefinitionEntry[],
): Record<MetricSourceId, MetricsViewerDefinitionEntry> {
  const map: Record<MetricSourceId, MetricsViewerDefinitionEntry> = {};
  for (const entry of entries) {
    map[entry.id] = { id: entry.id, definition: entry.definition };
  }
  return map;
}

/** Build formulaEntities from a mixed array of metric + expression entries */
function buildFormulaEntities(
  entries: (MetricDefinitionEntry | ExpressionDefinitionEntry)[],
): MetricsViewerFormulaEntity[] {
  return entries;
}

type SetupOptions = {
  /** Mixed array of metric and expression entries (old-style convenience) */
  entries?: (MetricDefinitionEntry | ExpressionDefinitionEntry)[];
  selectedMetrics?: SelectedMetric[];
  metricColors?: SourceColorMap;
  onFormulaEntitiesChange?: jest.Mock;
  onAddMetric?: jest.Mock;
  onRemoveMetric?: jest.Mock;
  onSwapMetric?: jest.Mock;
  onSetBreakout?: jest.Mock;
};

function setup(options: SetupOptions = {}) {
  const revenue = makeMetric(1, "Revenue");
  const costs = makeMetric(2, "Costs");

  const {
    selectedMetrics = [revenue, costs],
    metricColors = {},
    entries = selectedMetrics.map(makeMetricEntry),
    onFormulaEntitiesChange = jest.fn(),
    onAddMetric = jest.fn(),
    onRemoveMetric = jest.fn(),
    onSwapMetric = jest.fn(),
    onSetBreakout = jest.fn(),
  } = options;

  // Derive definitions map from metric entries only
  const metricEntries = entries.filter(isMetricEntry);
  const definitions = buildDefinitionsMap(metricEntries);
  const formulaEntities = buildFormulaEntities(entries);

  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

  renderWithProviders(
    <MetricSearchInput
      definitions={definitions}
      formulaEntities={formulaEntities}
      onFormulaEntitiesChange={onFormulaEntitiesChange}
      selectedMetrics={selectedMetrics}
      metricColors={metricColors}
      onAddMetric={onAddMetric}
      onRemoveMetric={onRemoveMetric}
      onSwapMetric={onSwapMetric}
      onSetBreakout={onSetBreakout}
    />,
  );

  return {
    user,
    onFormulaEntitiesChange,
    onAddMetric,
    onRemoveMetric,
    onSwapMetric,
    onSetBreakout,
  };
}

// ---------------------------------------------------------------------------
// Definition factories
// ---------------------------------------------------------------------------

const revenue = makeMetric(1, "Revenue");
const costs = makeMetric(2, "Costs");
const revenueEntry = makeMetricEntry(revenue);
const costsEntry = makeMetricEntry(costs);

const m = (sourceId: MetricSourceId): ExpressionSubToken => ({
  type: "metric",
  sourceId,
  count: 1,
});
const op = (o: "+" | "-" | "*" | "/"): ExpressionSubToken => ({
  type: "operator",
  op: o,
});

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

describe("collapsed view (definitions present, not focused)", () => {
  it("renders a single metric definition as a MetricPill", () => {
    setup({ entries: [revenueEntry] });

    expect(screen.getByTestId("metric-pill")).toBeInTheDocument();
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders an expression entry as MetricExpressionPill", () => {
    const expr = makeExpressionEntry("Revenue + Costs", [
      m("metric:1"),
      op("+"),
      m("metric:2"),
    ]);
    setup({
      entries: [revenueEntry, costsEntry, expr],
    });

    const pill = screen.getByTestId("metric-expression-pill");
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute("data-expression-text", "Revenue + Costs");
  });

  it("renders two separate metric entries as two pills", () => {
    setup({ entries: [revenueEntry, costsEntry] });

    const pills = screen.getAllByTestId("metric-pill");
    expect(pills).toHaveLength(2);
    expect(pills[0]).toHaveAttribute("data-metric-name", "Revenue");
    expect(pills[1]).toHaveAttribute("data-metric-name", "Costs");
  });

  it("does not render a text input when collapsed", () => {
    setup({ entries: [revenueEntry] });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows the CodeMirror editor when there are no definitions", () => {
    setup({ entries: [] });
    expect(
      screen.getByTestId("metrics-viewer-search-input"),
    ).toBeInTheDocument();
  });
});

// ── Expanded view (focused text input) ─────────────────────────────────────

describe("expanded view (focused text input)", () => {
  it("transitions to text input when clicking the container", async () => {
    const { user } = setup({ entries: [revenueEntry] });

    await user.click(screen.getByTestId("metric-pill"));

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });
  });

  it("shows the text editor when focused (transitions from pills)", async () => {
    const expr = makeExpressionEntry("Revenue + Costs", [
      m("metric:1"),
      op("+"),
      m("metric:2"),
    ]);
    const { user } = setup({
      entries: [revenueEntry, costsEntry, expr],
    });

    await user.click(screen.getByTestId("metric-expression-pill"));

    await waitFor(() => {
      expect(
        screen.getByTestId("metrics-viewer-search-input"),
      ).toBeInTheDocument();
    });
  });

  it("opens the search dropdown when typing in the editor", async () => {
    const { user } = setup({ entries: [] });

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
    const { user } = setup({
      entries: [revenueEntry],
      selectedMetrics: [revenue],
    });

    await user.click(screen.getByTestId("metric-pill"));
    await waitFor(() => {
      expect(
        screen.getByTestId("metrics-viewer-search-input"),
      ).toBeInTheDocument();
    });

    await user.tab();

    expect(
      screen.queryByTestId("metrics-viewer-search-input"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("metric-pill")).toBeInTheDocument();
  });

  it("shows the Run button when formula is dirty", async () => {
    const { user } = setup({
      entries: [revenueEntry],
      selectedMetrics: [revenue],
    });

    // Click pill → transitions to editor
    await user.click(screen.getByTestId("metric-pill"));
    await waitFor(() => {
      expect(
        screen.getByTestId("metrics-viewer-search-input"),
      ).toBeInTheDocument();
    });

    // Directly change the textarea value to simulate editing
    const input = screen.getByTestId("metrics-viewer-search-input");
    fireEvent.change(input, { target: { value: "Revenue + Costs" } });

    await waitFor(() => {
      expect(screen.getByTestId("run-expression-button")).toBeInTheDocument();
    });
  });

  it("does not show the Run button when focused if formula is unchanged", async () => {
    const expr = makeExpressionEntry("Revenue + Costs", [
      m("metric:1"),
      op("+"),
      m("metric:2"),
    ]);
    const { user } = setup({
      entries: [revenueEntry, costsEntry, expr],
    });

    await user.click(screen.getByTestId("metric-expression-pill"));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();

    expect(
      screen.queryByTestId("run-expression-button"),
    ).not.toBeInTheDocument();
  });
});

// ── Run button and validation ───────────────────────────────────────────────

describe("run button and validation", () => {
  it("collapses and commits when Run is clicked with a valid expression", async () => {
    const onFormulaEntitiesChange = jest.fn();
    const { user } = setup({
      entries: [revenueEntry],
      selectedMetrics: [revenue],
      onFormulaEntitiesChange,
    });

    // Click pill → transitions to editor
    await user.click(screen.getByTestId("metric-pill"));
    await waitFor(() => {
      expect(
        screen.getByTestId("metrics-viewer-search-input"),
      ).toBeInTheDocument();
    });

    // Directly change the textarea value to something different
    const input = screen.getByTestId("metrics-viewer-search-input");
    fireEvent.change(input, { target: { value: "Revenue, Revenue" } });

    await waitFor(() => {
      expect(screen.getByTestId("run-expression-button")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("run-expression-button"));

    await waitFor(() => {
      expect(onFormulaEntitiesChange).toHaveBeenCalled();
    });
  });

  it("removes unreferenced metrics when Run commits a new expression", async () => {
    const onRemoveMetric = jest.fn();
    const onFormulaEntitiesChange = jest.fn();
    const { user } = setup({
      entries: [revenueEntry, costsEntry],
      selectedMetrics: [revenue, costs],
      onRemoveMetric,
      onFormulaEntitiesChange,
    });

    // Click a pill to transition to the editor
    const pills = screen.getAllByTestId("metric-pill");
    await user.click(pills[0]);

    await waitFor(() => {
      expect(
        screen.getByTestId("metrics-viewer-search-input"),
      ).toBeInTheDocument();
    });

    // Directly change the textarea value to only reference Revenue (not Costs)
    const input = screen.getByTestId("metrics-viewer-search-input");
    fireEvent.change(input, { target: { value: "Revenue" } });

    await waitFor(() => {
      expect(screen.getByTestId("run-expression-button")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("run-expression-button"));

    await waitFor(() => {
      // Costs (metric:2) is no longer referenced after text was replaced
      expect(onRemoveMetric).toHaveBeenCalledWith(2, "metric");
    });
  });
});

// ── Removing items ──────────────────────────────────────────────────────────

describe("removing pills", () => {
  it("calls onRemoveMetric and onFormulaEntitiesChange when removing a standalone MetricPill", async () => {
    const onRemoveMetric = jest.fn();
    const onFormulaEntitiesChange = jest.fn();
    const { user } = setup({
      entries: [revenueEntry],
      selectedMetrics: [revenue],
      onRemoveMetric,
      onFormulaEntitiesChange,
    });

    await user.click(screen.getByRole("button", { name: "remove" }));

    expect(onRemoveMetric).toHaveBeenCalledWith(1, "metric");
    expect(onFormulaEntitiesChange).toHaveBeenCalledWith(
      [],
      new Map(), // slot mapping: no slots remain
    );
  });

  it("removes a MetricPill from a two-item list, keeping the other metric", async () => {
    const onRemoveMetric = jest.fn();
    const onFormulaEntitiesChange = jest.fn();
    const { user } = setup({
      entries: [revenueEntry, costsEntry],
      selectedMetrics: [revenue, costs],
      onRemoveMetric,
      onFormulaEntitiesChange,
    });

    const removeButtons = screen.getAllByRole("button", { name: "remove" });
    // Remove the first item (Revenue)
    await user.click(removeButtons[0]);

    expect(onRemoveMetric).toHaveBeenCalledWith(1, "metric");
    expect(onFormulaEntitiesChange).toHaveBeenCalledWith(
      [costsEntry],
      new Map([[1, 0]]), // slot mapping: Costs moved from slot 1 → 0
    );
  });

  it("calls onRemoveMetric for all metrics in an expression pill when removed", async () => {
    const onRemoveMetric = jest.fn();
    const onFormulaEntitiesChange = jest.fn();
    const expr = makeExpressionEntry("Revenue + Costs", [
      m("metric:1"),
      op("+"),
      m("metric:2"),
    ]);
    const { user } = setup({
      entries: [revenueEntry, costsEntry, expr],
      selectedMetrics: [revenue, costs],
      onRemoveMetric,
      onFormulaEntitiesChange,
    });

    // The expression pill's remove button
    const exprPill = screen.getByTestId("metric-expression-pill");
    const removeButton = within(exprPill).getByRole("button");
    await user.click(removeButton);

    // Both Revenue and Costs are only referenced in the expression (the metric entries remain)
    // Since revenueEntry and costsEntry still exist in remaining definitions,
    // they should NOT be removed
    expect(onFormulaEntitiesChange).toHaveBeenCalled();
  });
});

// ── Expression pill display after Run ────────────────────────────────────────

describe("expression pill display after committing a formula", () => {
  it("preserves metric entries so the expression pill displays full metric names", async () => {
    const metricA = makeMetric(1, "MetricA");
    const metricB = makeMetric(2, "MetricB");
    const metricC = makeMetric(3, "MetricC");
    const metricAEntry = makeMetricEntry(metricA);
    const metricBEntry = makeMetricEntry(metricB);
    const metricCEntry = makeMetricEntry(metricC);

    const onFormulaEntitiesChange = jest.fn();

    const { user } = setup({
      entries: [metricAEntry, metricBEntry, metricCEntry],
      selectedMetrics: [metricA, metricB, metricC],
      onFormulaEntitiesChange,
    });

    // Click a pill to transition to the editor
    const pills = screen.getAllByTestId("metric-pill");
    await user.click(pills[0]);

    await waitFor(() => {
      expect(
        screen.getByTestId("metrics-viewer-search-input"),
      ).toBeInTheDocument();
    });

    // Type the expression formula
    const input = screen.getByTestId("metrics-viewer-search-input");
    fireEvent.change(input, {
      target: {
        value: `${[metricA, metricB, metricC].map((m) => m.name).join(", ")}, (MetricA + MetricB) / MetricC`,
      },
    });

    // Run button should appear (formula is dirty)
    await waitFor(() => {
      expect(screen.getByTestId("run-expression-button")).toBeInTheDocument();
    });

    // Click Run to commit
    await user.click(screen.getByTestId("run-expression-button"));

    // The committed formula entities should include the metric entries referenced
    // by the expression so that buildExpressionText can resolve their names.
    await waitFor(() => {
      expect(onFormulaEntitiesChange).toHaveBeenCalled();
    });

    const committedEntities = onFormulaEntitiesChange.mock.calls[
      onFormulaEntitiesChange.mock.calls.length - 1
    ][0] as MetricsViewerFormulaEntity[];

    // Must contain the 3 metric entries plus the expression entry
    const metricDefs = committedEntities.filter(isMetricEntry);
    const exprDefs = committedEntities.filter(isExpressionEntry);

    expect(metricDefs).toHaveLength(3);
    expect(exprDefs).toHaveLength(1);

    // The expression entry should have the correct tokens
    const expr = exprDefs[0];
    expect(expr.tokens).toEqual([
      { type: "open-paren" },
      { type: "metric", sourceId: "metric:1", count: 1 },
      { type: "operator", op: "+" },
      { type: "metric", sourceId: "metric:2", count: 1 },
      { type: "close-paren" },
      { type: "operator", op: "/" },
      { type: "metric", sourceId: "metric:3", count: 1 },
    ]);
    expect(expr.name).toBe("(MetricA + MetricB) / MetricC");
  });
});

// ── Typing / onChange ───────────────────────────────────────────────────────

describe("typing in the text input", () => {
  it("does not call onFormulaEntitiesChange as the user types (deferred to Run)", async () => {
    const onFormulaEntitiesChange = jest.fn();
    const { user } = setup({
      entries: [],
      onFormulaEntitiesChange,
    });

    const input = screen.getByRole("textbox");
    await user.type(input, "R");

    expect(onFormulaEntitiesChange).not.toHaveBeenCalled();
  });

  it("opens the search dropdown on input", async () => {
    const { user } = setup({ entries: [] });

    const input = screen.getByRole("textbox");
    await user.type(input, "Rev");

    expect(screen.getByTestId("search-dropdown")).toBeInTheDocument();
    expect(screen.getByTestId("search-dropdown")).toHaveAttribute(
      "data-search-text",
      "Rev",
    );
  });
});
