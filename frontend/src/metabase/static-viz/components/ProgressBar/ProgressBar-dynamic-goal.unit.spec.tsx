import ReactDOMServer from "react-dom/server";

import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import type {
  DatasetData,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockFailedReferencedEntitiesResults,
  createMockReferencedEntitiesResults,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { StaticVisualization } from "../StaticVisualization";

const COLS = [createMockColumn({ name: "count", base_type: "type/Integer" })];
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
      referencedEntities: createMockReferencedEntitiesResults({ value: 250 }),
    });

    expect(root).toHaveTextContent("Goal 250");
  });

  it.each([
    ["has not answered", undefined],
    ["reports as failed", createMockFailedReferencedEntitiesResults()],
  ])(
    "measures progress against a goal of 0 for a reference the dataset %s",
    (_name, referencedEntities) => {
      expect(setup({ referencedEntities })).toHaveTextContent("Goal 0");
    },
  );
});
