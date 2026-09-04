import { createMockEntitiesState } from "__support__/store";
import { getMetadata } from "metabase/metadata-store";
import { createMockState } from "metabase/redux/store/mocks";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  Dataset,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import {
  createAdHocCard,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getFirstQueryResult, getQuestion } from "../store/selectors";

import * as core from "./core";
import {
  onReplaceAllVisualizationSettings,
  onUpdateVisualizationSettings,
} from "./visualization-settings";

jest.mock("./core", () => ({
  updateQuestion: jest.fn(() => () => Promise.resolve()),
}));

jest.mock("../store/selectors", () => ({
  getQuestion: jest.fn(),
  getFirstQueryResult: jest.fn(() => null),
  getPreviousQueryBuilderMode: jest.fn(() => "view"),
  getQueryBuilderMode: jest.fn(() => "view"),
  getDatasetEditorTab: jest.fn(() => null),
}));

const STATIC_SEGMENTS: VisualizationSettings = {
  "gauge.segments": [{ min: 0, max: 100, color: "red" }],
};

const DYNAMIC_SEGMENTS: VisualizationSettings = {
  "gauge.segments": [
    { min: 0, max: { type: "card", id: 1, column: "total" }, color: "red" },
  ],
};

const RESULT_WITH_ANSWER = createMockDataset({
  data: createMockDatasetData({
    cols: [createMockColumn({ name: "count" })],
    rows: [[10]],
    referenced_entities: {
      card: {
        1: {
          status: "completed",
          data: {
            cols: [createMockColumn({ name: "total" })],
            rows: [[42]],
          },
        },
      },
    },
  }),
});

const RESULT_WITH_FAILURE = createMockDataset({
  data: createMockDatasetData({
    cols: [createMockColumn({ name: "count" })],
    rows: [[10]],
    referenced_entities: {
      card: { 1: { status: "failed", error: "boom" } },
    },
  }),
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("onUpdateVisualizationSettings", () => {
  it("re-runs the query when a range starts referencing another question", async () => {
    await dispatchWith(
      STATIC_SEGMENTS,
      onUpdateVisualizationSettings(DYNAMIC_SEGMENTS),
    );
    expectRun(true);
  });

  it("does not re-run the query for a static setting change", async () => {
    await dispatchWith(
      STATIC_SEGMENTS,
      onUpdateVisualizationSettings({
        "gauge.segments": [{ min: 0, max: 200, color: "red" }],
      }),
    );
    expectRun(false);
  });

  it("does not re-run when a dynamic range is removed", async () => {
    await dispatchWith(
      DYNAMIC_SEGMENTS,
      onUpdateVisualizationSettings(STATIC_SEGMENTS),
    );
    expectRun(false);
  });

  it("does not run the query when the question is not editable", async () => {
    jest
      .spyOn(Lib, "queryDisplayInfo")
      .mockReturnValue({ isNative: false, isEditable: false });

    await dispatchWith(
      STATIC_SEGMENTS,
      onUpdateVisualizationSettings(DYNAMIC_SEGMENTS),
    );
    expectRun(false);
  });
});

describe("onReplaceAllVisualizationSettings", () => {
  it("re-runs the query when a range starts referencing another question", async () => {
    await dispatchWith(
      STATIC_SEGMENTS,
      onReplaceAllVisualizationSettings(DYNAMIC_SEGMENTS),
    );
    expectRun(true);
  });

  it("does not re-run the query for a static setting change", async () => {
    await dispatchWith(
      STATIC_SEGMENTS,
      onReplaceAllVisualizationSettings({
        "gauge.segments": [{ min: 0, max: 200, color: "red" }],
      }),
    );
    expectRun(false);
  });

  it("does not re-run when a dynamic range is removed", async () => {
    await dispatchWith(
      DYNAMIC_SEGMENTS,
      onReplaceAllVisualizationSettings(STATIC_SEGMENTS),
    );
    expectRun(false);
  });

  it("re-runs when a dynamic range is retargeted to a different entity", async () => {
    await dispatchWith(
      DYNAMIC_SEGMENTS,
      onReplaceAllVisualizationSettings({
        "gauge.segments": [
          { min: 0, max: { type: "card", id: 2, column: "avg" }, color: "red" },
        ],
      }),
    );
    expectRun(true);
  });

  it("re-runs when a dynamic range is retargeted to another column of the same entity", async () => {
    await dispatchWith(
      DYNAMIC_SEGMENTS,
      onReplaceAllVisualizationSettings({
        "gauge.segments": [
          { min: 0, max: { type: "card", id: 1, column: "avg" }, color: "red" },
        ],
      }),
    );
    expectRun(true);
  });

  it("re-runs on an unrelated change while a reference is still unanswered", async () => {
    await dispatchWith(
      DYNAMIC_SEGMENTS,
      onReplaceAllVisualizationSettings(DYNAMIC_SEGMENTS),
    );
    expectRun(true);
  });

  it("does not re-run when the result already answers every reference", async () => {
    await dispatchWith(
      DYNAMIC_SEGMENTS,
      onReplaceAllVisualizationSettings(DYNAMIC_SEGMENTS),
      { result: RESULT_WITH_ANSWER },
    );
    expectRun(false);
  });

  it("re-runs when the referenced query previously failed", async () => {
    await dispatchWith(
      DYNAMIC_SEGMENTS,
      onReplaceAllVisualizationSettings(DYNAMIC_SEGMENTS),
      { result: RESULT_WITH_FAILURE },
    );
    expectRun(true);
  });

  it("does not re-run for a display that has no dynamic goals", async () => {
    await dispatchWith(
      STATIC_SEGMENTS,
      onReplaceAllVisualizationSettings(DYNAMIC_SEGMENTS),
      { display: "table" },
    );
    expectRun(false);
  });
});

async function dispatchWith(
  settings: VisualizationSettings,
  thunk: ReturnType<
    | typeof onUpdateVisualizationSettings
    | typeof onReplaceAllVisualizationSettings
  >,
  {
    result = null,
    display,
  }: { result?: Dataset | null; display?: VisualizationDisplay } = {},
) {
  jest.mocked(getQuestion).mockReturnValue(createQuestion(display, settings));
  jest.mocked(getFirstQueryResult).mockReturnValue(result);
  await thunk(jest.fn(), jest.fn());
}

function createQuestion(
  display: VisualizationDisplay = "gauge",
  settings: VisualizationSettings,
) {
  const card = createAdHocCard({
    display,
    visualization_settings: settings,
  });

  const metadata = getMetadata(
    createMockState({
      entities: createMockEntitiesState({
        databases: [createSampleDatabase()],
      }),
    }),
  );

  return new Question(card, metadata);
}

function expectRun(run: boolean) {
  return expect(core.updateQuestion).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ run }),
  );
}
