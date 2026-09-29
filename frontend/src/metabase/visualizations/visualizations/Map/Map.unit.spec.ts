import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import { getSettingsWidgets } from "metabase/viz-core";
import { createMockCard } from "metabase-types/api/mocks/card";
import { createMockDatasetData } from "metabase-types/api/mocks/dataset";

import { MAP_VIZ_DEFINITION } from "./definition";

registerVisualizations();

describe("Map viz settings (metabase#40999)", () => {
  it("should expose the 'Pin type' setting as an editable widget", () => {
    const settings = checkNotNull(MAP_VIZ_DEFINITION.settings);
    const series = [
      {
        card: createMockCard({ display: "map" }),
        data: createMockDatasetData({ rows: [], cols: [] }),
      },
    ];

    const widgets = getSettingsWidgets(
      { "map.pin_type": settings["map.pin_type"] },
      {},
      { "map.type": "pin", "map.pin_type": "tiles" },
      series,
      () => {},
    );

    expect(widgets.map((widget) => widget.id)).toContain("map.pin_type");
    expect(
      widgets.find((widget) => widget.id === "map.pin_type"),
    ).toMatchObject({
      hidden: false,
      props: {
        options: expect.arrayContaining([
          expect.objectContaining({ value: "markers" }),
        ]),
      },
    });
  });
});
