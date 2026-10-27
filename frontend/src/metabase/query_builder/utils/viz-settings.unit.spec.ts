import { createMockMetadata } from "__support__/metadata";
import { registerVisualizations } from "metabase/visualizations/register";
import { registerVisualization } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockSingleSeries,
  createMockTableColumnOrderSetting,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createAdHocCard,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  getAdHocQuestionWithVizSettings,
  getQuestionWithDefaultVisualizationSettings,
} from "./viz-settings";

registerVisualizations();

const PREFIX = "custom:demo-viz:";
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

describe("getAdHocQuestionWithVizSettings", () => {
  it("should sync table columns with the query of the current question (metabase#22382)", () => {
    const currentQuestion = new Question(
      createAdHocCard({
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
        },
        visualization_settings: {
          "table.columns": [
            createMockTableColumnOrderSetting({
              name: "CREATED_AT",
              enabled: false,
            }),
            createMockTableColumnOrderSetting({ name: "count", enabled: true }),
          ],
        },
      }),
      METADATA,
    );
    const query = Lib.removeClause(
      currentQuestion.query(),
      -1,
      Lib.breakouts(currentQuestion.query(), -1)[0],
    );

    const question = getAdHocQuestionWithVizSettings({
      question: currentQuestion.setQuery(query),
      currentQuestion,
    });

    expect(question.settings()["table.columns"]).toEqual([
      { name: "count", enabled: true },
    ]);
  });
});
