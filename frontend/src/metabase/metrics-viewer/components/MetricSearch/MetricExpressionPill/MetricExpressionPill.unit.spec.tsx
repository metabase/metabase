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
}: {
  expressionEntry?: ExpressionDefinitionEntry;
  onNameChange?: jest.Mock;
  onRemove?: jest.Mock;
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
    />,
  );
  return { onNameChange, onRemove };
}

describe("MetricExpressionPill action menu", () => {
  it("should open a menu with a Rename item when the pill is clicked", async () => {
    setup();

    await userEvent.click(screen.getByTestId("metrics-viewer-search-pill"));

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
});
