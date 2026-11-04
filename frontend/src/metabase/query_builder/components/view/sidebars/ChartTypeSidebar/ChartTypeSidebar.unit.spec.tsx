import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen, within } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockReferencedEntitiesResults,
} from "metabase-types/api/mocks";
import {
  createAdHocCard,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { updateQuestion } from "../../../../actions";

import { ChartTypeSidebar } from "./ChartTypeSidebar";

jest.mock("../../../../actions", () => ({
  ...jest.requireActual("../../../../actions"),
  updateQuestion: jest.fn(() => () => Promise.resolve()),
}));

registerVisualizations();

const createResult = (insights: any[] | undefined): Dataset =>
  createMockDataset({
    data: {
      rows: [[1]],
      // Unjustified type cast. FIXME
      cols: [{ name: "count", base_type: "type/Integer" }] as any,
      insights,
    },
  });

type SetupOpts = {
  question?: Question;
  result: Dataset;
};

function setup({ question, result }: SetupOpts) {
  return renderWithProviders(
    <ChartTypeSidebar question={question} result={result} />,
  );
}

const getSensibleChartNames = () => {
  const sensibleList = screen.getByTestId("display-options-sensible");
  return within(sensibleList)
    .getAllByRole("option")
    .map((el) => el.getAttribute("aria-label"));
};

describe("ChartTypeSidebar", () => {
  it("should not change the sensible chart list when result changes", () => {
    const resultWithInsights = createResult([
      { col: "count", unit: "month", "last-value": 1 },
    ]);

    const { rerender } = setup({ result: resultWithInsights });
    const initialCharts = getSensibleChartNames();

    // Simulate what happens when pivot is selected — result loses insights
    const resultWithoutInsights = createResult(undefined);

    rerender(
      <ChartTypeSidebar
        // Unjustified type cast. FIXME
        question={null as any}
        result={resultWithoutInsights}
      />,
    );

    expect(getSensibleChartNames()).toEqual(initialCharts);
  });
});

describe("ChartTypeSidebar with a goal that references another question", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.mocked(updateQuestion).mockClear();
  });

  it("runs the query when the new chart type has a goal the result does not answer", async () => {
    setup({ question: createGoalQuestion(), result: createGoalResult() });

    await userEvent.click(screen.getByTestId("Progress-button"));

    expectRun(true);
  });

  it("does not run the query when the result already answers the goal", async () => {
    setup({
      question: createGoalQuestion(),
      result: createGoalResult({
        referencedEntities: createMockReferencedEntitiesResults({
          column: "goal",
          value: 100,
        }),
      }),
    });

    await userEvent.click(screen.getByTestId("Progress-button"));

    expectRun(false);
  });

  it("does not run the query when the question is not editable", async () => {
    setup({ question: createGoalQuestion(), result: createGoalResult() });
    jest
      .spyOn(Lib, "queryDisplayInfo")
      .mockReturnValue({ isNative: false, isEditable: false });

    await userEvent.click(screen.getByTestId("Progress-button"));

    expectRun(false);
  });
});

function createGoalQuestion() {
  const card = createAdHocCard({
    display: "scalar",
    visualization_settings: {
      "progress.goal": { type: "card", id: 9, column: "goal" },
    },
  });
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });

  return new Question(card, metadata);
}

function createGoalResult({
  referencedEntities,
}: {
  referencedEntities?: Dataset["data"]["referenced_entities"];
} = {}) {
  return createMockDataset({
    data: createMockDatasetData({
      cols: [createMockColumn({ name: "count", base_type: "type/Integer" })],
      rows: [[1]],
      referenced_entities: referencedEntities,
    }),
  });
}

function expectRun(run: boolean) {
  expect(updateQuestion).toHaveBeenCalledTimes(1);
  expect(updateQuestion).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ run }),
  );
}
