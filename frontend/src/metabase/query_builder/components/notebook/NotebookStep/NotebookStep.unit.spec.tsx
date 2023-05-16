import React from "react";
import { renderWithProviders, screen } from "__support__/ui";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";

import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import type Question from "metabase-lib/Question";

import type { NotebookStep as INotebookStep, NotebookStepType } from "../types";
import { createMockNotebookStep, DEFAULT_QUESTION } from "../test-utils";
import NotebookStep from "./NotebookStep";

type SetupOpts = {
  step?: INotebookStep;
  question?: Question;
};

function setup({
  step = createMockNotebookStep(),
  question = DEFAULT_QUESTION,
}: SetupOpts = {}) {
  const openStep = jest.fn();
  const updateQuery = jest.fn();

  setupDatabasesEndpoints([createSampleDatabase()]);
  setupSearchEndpoints([]);

  renderWithProviders(
    <NotebookStep
      step={step}
      sourceQuestion={question}
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
});
