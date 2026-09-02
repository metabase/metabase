import { createMockMetadata } from "__support__/metadata";
import { registerVisualizations } from "metabase/visualizations/register";
import { registerVisualization } from "metabase/viz-core";
import Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockSingleSeries,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { getQuestionWithDefaultVisualizationSettings } from "./viz-settings";

registerVisualizations();

const PREFIX = "custom-viz:demo-viz:";
const METADATA = createMockMetadata({ databases: [createSampleDatabase()] });

function setup(visualization_settings: VisualizationSettings) {
  const card = createMockCard({
    display: "custom:demo-viz",
    visualization_settings,
  });
  const question = new Question(card, METADATA);
  const series = [createMockSingleSeries(card)];

  return { question, series };
}

describe("getQuestionWithDefaultVisualizationSettings", () => {
  beforeAll(() => {
    registerVisualization({
      identifier: "custom:demo-viz",
      getUiName: () => "Demo viz",
      checkRenderable: () => undefined,
      settings: {
        [`${PREFIX}threshold`]: {
          widget: "number",
          persistDefault: true,
          getDefault: () => 0,
        },
        [`${PREFIX}label`]: {
          widget: "input",
          persistDefault: true,
          getDefault: () => "Label",
        },
      },
    });
  });

  it("leaves a question alone when its legacy keys already hold every persistable default", () => {
    const { question, series } = setup({ threshold: 5, label: "Mine" });

    expect(getQuestionWithDefaultVisualizationSettings(question, series)).toBe(
      question,
    );
  });

  it("writes a missing persistable default under its namespaced key and adopts the legacy keys", () => {
    const { question, series } = setup({ threshold: 5 });

    const result = getQuestionWithDefaultVisualizationSettings(
      question,
      series,
    );

    expect(result.settings()).toEqual({
      [`${PREFIX}threshold`]: 5,
      [`${PREFIX}label`]: "Label",
    });
  });
});
