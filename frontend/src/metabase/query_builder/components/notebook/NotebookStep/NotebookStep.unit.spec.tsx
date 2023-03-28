import React from "react";
import { renderWithProviders, screen } from "__support__/ui";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";

import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { getSavedStructuredQuestion } from "metabase-lib/mocks";
import type Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import {
  NotebookStep as INotebookStep,
  NotebookStepType,
} from "../lib/steps.types";
import NotebookStep from "./NotebookStep";

type SetupOpts = {
  step?: INotebookStep;
  question?: Question;
};

const DEFAULT_QUESTION = getSavedStructuredQuestion();
const DEFAULT_QUERY = DEFAULT_QUESTION.query() as StructuredQuery;

function createNotebookStep(opts = {}): INotebookStep {
  return {
    id: "test-step",
    type: "data",
    stageIndex: 0,
    itemIndex: 0,
    query: DEFAULT_QUERY,
    valid: true,
    active: true,
    visible: true,
    actions: [],
    previewQuery: null,
    next: null,
    previous: null,
    revert: jest.fn(),
    clean: jest.fn(),
    update: jest.fn(),
    ...opts,
  };
}

function setup({
  step = createNotebookStep(),
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
    const step = createNotebookStep({ type });
    const testId = `step-${type}-${step.stageIndex}-${step.itemIndex}`;
    setup({ step });

    expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove step" }),
    ).toBeInTheDocument();
  });

  it("doesn't render the remove button if step revert isn't implemented", () => {
    const step = createNotebookStep({ type: "data", revert: null });
    setup({ step });

    expect(
      screen.queryByRole("button", { name: "Remove step" }),
    ).not.toBeInTheDocument();
  });
});
