import { checkNotNull } from "metabase/utils/types";
import type { LegendPosition, VisualizationSettings } from "metabase-types/api";
import { createMockSingleSeries } from "metabase-types/api/mocks";

import { LEGEND_POSITION_SETTINGS } from "./legend";

const singleSeries = [createMockSingleSeries({ display: "line" })];

describe("LEGEND_POSITION_SETTINGS", () => {
  const setting = checkNotNull(LEGEND_POSITION_SETTINGS["legend.position"]);
  const getHidden = checkNotNull(setting.getHidden);
  const isValid = checkNotNull(setting.isValid);

  it("places the legend automatically by default", () => {
    expect(setting.getDefault?.(singleSeries, {})).toBe("auto");
  });

  it.each<LegendPosition>(["auto", "top", "bottom", "left", "right", "off"])(
    "accepts a stored %s",
    (position) => {
      expect(isValid(singleSeries, { "legend.position": position })).toBe(true);
    },
  );

  it("rejects a stored value outside the enum", () => {
    const stored: VisualizationSettings = JSON.parse(
      '{"legend.position":"middle"}',
    );

    expect(isValid(singleSeries, stored)).toBe(false);
  });

  it("offers every position in a select in the designer's order", () => {
    expect(setting.widget).toBe("select");
    expect(
      setting.getProps?.(
        singleSeries,
        {},
        () => {},
        {},
        () => {},
      ),
    ).toEqual({
      options: [
        { name: "Auto", value: "auto" },
        { name: "Top", value: "top" },
        { name: "Bottom", value: "bottom" },
        { name: "Left", value: "left" },
        { name: "Right", value: "right" },
        { name: "Off", value: "off" },
      ],
    });
  });

  it("hides the setting for a single series with one dimension and one metric", () => {
    expect(
      getHidden(singleSeries, {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
      }),
    ).toBe(true);
  });

  it("shows the setting when there are several series", () => {
    expect(
      getHidden(
        [
          createMockSingleSeries({ display: "line" }),
          createMockSingleSeries({ display: "line" }),
        ],
        { "graph.dimensions": ["CREATED_AT"], "graph.metrics": ["count"] },
      ),
    ).toBe(false);
  });

  it("shows the setting when there is a breakout", () => {
    expect(
      getHidden(singleSeries, {
        "graph.dimensions": ["CREATED_AT", "CATEGORY"],
        "graph.metrics": ["count"],
      }),
    ).toBe(false);
  });

  it("shows the setting when there are several metrics", () => {
    expect(
      getHidden(singleSeries, {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count", "sum"],
      }),
    ).toBe(false);
  });
});
