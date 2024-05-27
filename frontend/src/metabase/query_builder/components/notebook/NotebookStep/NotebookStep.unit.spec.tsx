import userEvent from "@testing-library/user-event";

import {
  setupDatabasesEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type Question from "metabase-lib/v1/Question";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { createMockNotebookStep } from "../test-utils";
import type { NotebookStep as INotebookStep, NotebookStepType } from "../types";

import NotebookStep from "./NotebookStep";

type SetupOpts = {
  step?: INotebookStep;
  question?: Question;
};

function setup({ step = createMockNotebookStep() }: SetupOpts = {}) {
  const openStep = jest.fn();
  const updateQuery = jest.fn();

  setupDatabasesEndpoints([createSampleDatabase()]);
  setupSearchEndpoints([]);
  setupRecentViewsEndpoints([]);

  renderWithProviders(
    <NotebookStep
      step={step}
      isLastStep={false}
      isLastOpened={false}
      reportTimezone="Europe/London"
      openStep={openStep}
      updateQuery={updateQuery}
    />,
  );

  return {
    openStep,
    updateQuery,
  };
}

const STEP_TYPES: NotebookStepType[] = [
  "data",
  "join",
  "expression",
  "filter",
  "summarize",
  "aggregate",
  "breakout",
  "sort",
  "limit",
];

describe("NotebookStep", () => {
  test.each(STEP_TYPES)(`renders a %s step correctly`, type => {
    const step = createMockNotebookStep({ type });
    const testId = `step-${type}-${step.stageIndex}-${step.itemIndex}`;
    setup({ step });

    expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove step" }),
    ).toBeInTheDocument();
  });

  it("doesn't render the remove button if step revert isn't implemented", () => {
    const step = createMockNotebookStep({ type: "data", revert: null });
    setup({ step });

    expect(
      screen.queryByRole("button", { name: "Remove step" }),
    ).not.toBeInTheDocument();
  });

  it("sets the row limit only on blur", async () => {
    const step = createMockNotebookStep({ type: "limit" });
    const { updateQuery } = setup({ step });

    const input = screen.getByPlaceholderText("Enter a limit");
    await userEvent.type(input, "38");
    await userEvent.type(input, "clear");
    await userEvent.type(input, "42");
    input.blur();

    expect(updateQuery).toHaveBeenCalledTimes(1);
  });
});
