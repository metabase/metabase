import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "__support__/ui";

import type { ExpressionDefinitionEntry } from "../../../types/viewer-state";
import type { MetricNameMap } from "../utils";

import { MetricExpressionPill } from "./MetricExpressionPill";

function buildEntry(
  overrides: Partial<ExpressionDefinitionEntry> = {},
): ExpressionDefinitionEntry {
  return {
    id: "expression:abc",
    type: "expression",
    name: "A + B",
    tokens: [
      { type: "metric", sourceId: "metric:1", count: 1 },
      { type: "operator", op: "+" },
      { type: "metric", sourceId: "metric:2", count: 1 },
    ],
    ...overrides,
  };
}

function setup({
  expressionEntry = buildEntry(),
  onNameChange = jest.fn(),
  onRemove = jest.fn(),
  onEdit = jest.fn(),
}: {
  expressionEntry?: ExpressionDefinitionEntry;
  onNameChange?: jest.Mock;
  onRemove?: jest.Mock;
  onEdit?: jest.Mock;
} = {}) {
  const metricNames: MetricNameMap = {
    "metric:1": "A",
    "metric:2": "B",
  };
  renderWithProviders(
    <MetricExpressionPill
      expressionEntry={expressionEntry}
      metricNames={metricNames}
      onNameChange={onNameChange}
      onRemove={onRemove}
      onEdit={onEdit}
    />,
  );
  return { onNameChange, onRemove, onEdit };
}

describe("MetricExpressionPill expression rendering", () => {
  it("should display ordinal badges after repeated metrics when no custom name is provided", () => {
    // Expression "A + A + A" — same metric repeated three times.
    // Without a custom name, the pill is rendered from tokens and each
    // duplicated occurrence should be suffixed with an ordinal badge.
    const expressionEntry: ExpressionDefinitionEntry = {
      id: "expression:repeated",
      type: "expression",
      name: "",
      tokens: [
        { type: "metric", sourceId: "metric:1", count: 1 },
        { type: "operator", op: "+" },
        { type: "metric", sourceId: "metric:1", count: 2 },
        { type: "operator", op: "+" },
        { type: "metric", sourceId: "metric:1", count: 3 },
      ],
    };

    setup({ expressionEntry });

    const pill = screen.getByTestId("metrics-viewer-search-pill");
    // The raw expression text is shown — custom-name fallback is not used.
    expect(pill).toHaveTextContent(/A\s*\+\s*A/);
    // The first "A" is unique so far (no badge), but the second and third
    // are non-unique and should carry ordinal badges "2" and "3".
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("should display ordinal badges when the custom name matches the expression text", () => {
    // When the stored `name` equals the auto-generated expression text, the pill
    // should still render the token-based view (with ordinal badges) rather than
    // echoing the plain string — otherwise duplicate metrics would lose their
    // disambiguating numbers.
    const expressionEntry: ExpressionDefinitionEntry = {
      id: "expression:repeated-named",
      type: "expression",
      name: "A + A + A",
      tokens: [
        { type: "metric", sourceId: "metric:1", count: 1 },
        { type: "operator", op: "+" },
        { type: "metric", sourceId: "metric:1", count: 2 },
        { type: "operator", op: "+" },
        { type: "metric", sourceId: "metric:1", count: 3 },
      ],
    };

    setup({ expressionEntry });

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("should not display ordinal badges when all metrics are unique", () => {
    // Default entry — "A + B" with distinct metrics, no custom name behavior.
    setup({ expressionEntry: buildEntry({ name: "" }) });

    expect(screen.queryByText("2")).not.toBeInTheDocument();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });
});

describe("MetricExpressionPill action menu", () => {
  it("should open a menu with a Rename item when the pill is clicked", async () => {
    setup();

    await userEvent.click(screen.getByTestId("metrics-viewer-search-pill"));

    expect(await screen.findByText("Edit")).toBeInTheDocument();
    expect(await screen.findByText("Rename")).toBeInTheDocument();
  });

  it("should start the inline rename flow when Rename is clicked", async () => {
    setup();

    await userEvent.click(screen.getByTestId("metrics-viewer-search-pill"));
    await userEvent.click(await screen.findByText("Rename"));

    expect(
      await screen.findByTestId("expression-name-input"),
    ).toBeInTheDocument();
    // The textarea inside EditableText should be focused after Rename.
    expect(await screen.findByRole("textbox")).toHaveFocus();
  });

  it('should call onEdit if "Edit" menu item is clicked', async () => {
    const { onEdit } = setup();

    await userEvent.click(screen.getByTestId("metrics-viewer-search-pill"));
    await userEvent.click(await screen.findByText("Edit"));

    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
