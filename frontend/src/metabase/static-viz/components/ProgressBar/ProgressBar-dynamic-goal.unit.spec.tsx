import ReactDOMServer from "react-dom/server";

import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import type { RawSeries, VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { StaticVisualization } from "../StaticVisualization";

const COLS = [
  createMockColumn({ name: "count", base_type: "type/Integer" }),
  createMockColumn({ name: "target", base_type: "type/Integer" }),
];
const SETTINGS: VisualizationSettings = {
  "progress.goal": { type: "card", id: 9, column: "goal" },
};

type SetupOpts = {
  settings?: VisualizationSettings;
};

function setup({ settings = SETTINGS }: SetupOpts = {}) {
  const rawSeries: RawSeries = [
    createMockSingleSeries(
      createMockCard({ display: "progress", visualization_settings: settings }),
      {
        data: createMockDatasetData({
          cols: COLS,
          rows: [[50, 300]],
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

  it("measures progress against a column of this chart", () => {
    const root = setup({ settings: { "progress.goal": "target" } });

    expect(root).toHaveTextContent("Goal 300");
  });

  it("formats the goal with this chart's column settings", () => {
    const root = setup({
      settings: {
        "progress.goal": 2500,
        column_settings: { '["name","count"]': { prefix: "$" } },
      },
    });

    expect(root).toHaveTextContent("Goal $2,500");
  });

  // the backend resolves references before rendering, so one left over couldn't resolve
  it("measures progress against a goal of 0 for a reference to another entity (metabase#85219)", () => {
    expect(setup()).toHaveTextContent("Goal 0");
  });
});
