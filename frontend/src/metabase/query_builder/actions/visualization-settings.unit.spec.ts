import { createMockEntitiesState } from "__support__/store";
import { createMockState } from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";
import {
  createAdHocCard,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getQuestion } from "../selectors";

import * as core from "./core";
import {
  onReplaceAllVisualizationSettings,
  onUpdateVisualizationSettings,
} from "./visualization-settings";

jest.mock("./core", () => ({
  updateQuestion: jest.fn(() => () => Promise.resolve()),
}));

jest.mock("../selectors", () => ({
  getQuestion: jest.fn(),
  getPreviousQueryBuilderMode: jest.fn(() => "view"),
  getQueryBuilderMode: jest.fn(() => "view"),
  getDatasetEditorTab: jest.fn(() => null),
}));

const STATIC_SEGMENTS: VisualizationSettings = {
  "gauge.segments": [{ min: 0, max: 100, color: "red" }],
};

const DYNAMIC_SEGMENTS: VisualizationSettings = {
  "gauge.segments": [
    { min: 0, max: { card_id: 1, column: "total" }, color: "red" },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
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

  it("re-runs when a dynamic range is retargeted to a different column", async () => {
    await dispatchWith(
      DYNAMIC_SEGMENTS,
      onReplaceAllVisualizationSettings({
        "gauge.segments": [
          { min: 0, max: { card_id: 2, column: "avg" }, color: "red" },
        ],
      }),
    );
    expectRun(true);
  });
});

function createGaugeQuestion(settings: VisualizationSettings) {
  const card = createAdHocCard({
    display: "gauge",
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

async function dispatchWith(
  current: VisualizationSettings,
  thunk: ReturnType<
    | typeof onUpdateVisualizationSettings
    | typeof onReplaceAllVisualizationSettings
  >,
) {
  jest.mocked(getQuestion).mockReturnValue(createGaugeQuestion(current));
  await thunk(jest.fn(), jest.fn());
}

function expectRun(run: boolean) {
  return expect(core.updateQuestion).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ run }),
  );
}
