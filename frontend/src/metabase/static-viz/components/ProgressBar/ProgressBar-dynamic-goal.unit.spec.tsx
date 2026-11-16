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

const COLS = [createMockColumn({ name: "count", base_type: "type/Integer" })];
// the backend substitutes a goal it resolves, so a reference here is one it couldn't resolve
const UNRESOLVED_GOAL_SETTINGS: VisualizationSettings = {
  "progress.goal": { type: "card", id: 9, column: "goal" },
};

type SetupOpts = {
  settings: VisualizationSettings;
};

function setup({ settings }: SetupOpts) {
  const rawSeries: RawSeries = [
    createMockSingleSeries(
      createMockCard({ display: "progress", visualization_settings: settings }),
      {
        data: createMockDatasetData({ cols: COLS, rows: [[50]] }),
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
  it("measures progress against a static or backend-resolved goal value", () => {
    const root = setup({ settings: { "progress.goal": 250 } });

    expect(root).toHaveTextContent("Goal 250");
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

  it("measures progress against a goal of 0 for a reference the backend left unresolved (metabase#85219)", () => {
    expect(setup({ settings: UNRESOLVED_GOAL_SETTINGS })).toHaveTextContent(
      "Goal 0",
    );
  });
});
