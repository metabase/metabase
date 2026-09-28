import ReactDOMServer from "react-dom/server";

import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import type {
  DatasetData,
  RawSeries,
  ReferencedEntitiesResults,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { StaticVisualization } from "../StaticVisualization";

const COLS = [createMockColumn({ name: "count", base_type: "type/Integer" })];
const GOAL_ERROR = "Couldn't load the value this chart's goal depends on.";
const SETTINGS: VisualizationSettings = {
  "progress.goal": { type: "card", id: 9, column: "goal" },
};

type SetupOpts = {
  settings?: VisualizationSettings;
  referencedEntities?: DatasetData["referenced_entities"];
};

function setup({ settings = SETTINGS, referencedEntities }: SetupOpts = {}) {
  const rawSeries: RawSeries = [
    createMockSingleSeries(
      createMockCard({ display: "progress", visualization_settings: settings }),
      {
        data: createMockDatasetData({
          cols: COLS,
          rows: [[50]],
          referenced_entities: referencedEntities,
        }),
      },
    ),
  ];

  const root = document.createElement("div");

  root.innerHTML = ReactDOMServer.renderToStaticMarkup(
    <StaticVisualization
      rawSeries={rawSeries}
      renderingContext={createStaticRenderingContext()}
    />,
  );

  return root;
}

describe("static progress chart with a dynamic goal", () => {
  it("measures progress against a static goal value", () => {
    const root = setup({ settings: { "progress.goal": 250 } });

    expect(root).toHaveTextContent("Goal 250");
  });

  it("measures progress against the value answered by the dataset", () => {
    const root = setup({
      referencedEntities: createReferencedEntitiesResults(250),
    });

    expect(root).toHaveTextContent("Goal 250");
  });

  it("throws for a reference the dataset has not answered", () => {
    expect(() => setup()).toThrow(GOAL_ERROR);
  });

  it("throws for a reference whose query failed", () => {
    expect(() =>
      setup({
        referencedEntities: {
          card: { 9: { status: "failed", error: "boom" } },
        },
      }),
    ).toThrow(GOAL_ERROR);
  });
});

function createReferencedEntitiesResults(
  value: number,
): ReferencedEntitiesResults {
  return {
    card: {
      9: {
        status: "completed",
        data: { cols: [createMockColumn({ name: "goal" })], rows: [[value]] },
      },
    },
  };
}
