import userEvent from "@testing-library/user-event";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type Question from "metabase-lib/v1/Question";
import { createMockCollection } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { createMockNotebookStep } from "../../test-utils";
import type {
  NotebookStep as INotebookStep,
  NotebookStepType,
} from "../../types";
import { NotebookProvider } from "../Notebook/context";

import { NotebookStep } from "./NotebookStep";

type SetupOpts = {
  step?: INotebookStep;
  question?: Question;
};

function setup({ step = createMockNotebookStep() }: SetupOpts = {}) {
  const openStep = jest.fn();
  const updateQuery = jest.fn();

  setupDatabasesEndpoints([createSampleDatabase()]);
  setupSearchEndpoints([]);
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection(ROOT_COLLECTION)],
  });

  renderWithProviders(
    <NotebookProvider>
      <NotebookStep
        step={step}
        isLastStep={false}
        isLastOpened={false}
        reportTimezone="Europe/London"
        openStep={openStep}
        updateQuery={updateQuery}
      />
    </NotebookProvider>,
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
  test.each(STEP_TYPES)(`renders a %s step correctly`, (type) => {
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

  it("lays out the step content and preview button columns with flexible widths so icons don't overflow on resize (metabase#53036)", () => {
    setup();

    /* eslint-disable testing-library/no-node-access -- walking to the flex column wrappers has no Testing Library equivalent */
    const previewButtonColumn = screen.getByTestId(
      "step-preview-button",
    ).parentElement;
    const stepRow = previewButtonColumn?.parentElement;
    const contentColumn = stepRow?.firstElementChild;
    /* eslint-enable testing-library/no-node-access */

    // Both columns must size with `flex` (shrinkable flex-basis) rather than a
    // fixed `width`, otherwise their contents overflow and overlap on a narrow
    // viewport.
    expect(contentColumn).toHaveStyle({
      flex: `1 1 ${(11 / 12) * 100}%`,
    });
    expect(contentColumn).not.toHaveStyle({ width: `${(11 / 12) * 100}%` });
    expect(previewButtonColumn).toHaveStyle({
      flex: `1 1 ${(1 / 12) * 100}%`,
    });
    expect(previewButtonColumn).not.toHaveStyle({
      width: `${(1 / 12) * 100}%`,
    });
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
