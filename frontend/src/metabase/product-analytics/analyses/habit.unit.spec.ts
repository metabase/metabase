import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { getTableQuery } from "../base-query";

import { HABIT_CONFIG } from "./habit";
import type { HabitSettings } from "./types";

const SETTINGS: HabitSettings = {
  base_query: Lib.toJsQuery(getTableQuery(SAMPLE_PROVIDER, ORDERS_ID)),
  date_range: "past90days",
  counting: "person",
  granularity: "day",
  drill: null,
  "habit.active": null,
  "habit.values": "count",
};

const PEOPLE_KEY = getColumnKey({ name: "people" });

describe("HABIT_CONFIG.getVizSettings", () => {
  it("shows how many people showed up", () => {
    const vizSettings = HABIT_CONFIG.getVizSettings(SETTINGS);

    expect(vizSettings["graph.y_axis.title_text"]).toBe("People");
    expect(vizSettings.column_settings?.[PEOPLE_KEY]).toBeUndefined();
  });

  it("shows people as a percent of the total", () => {
    const vizSettings = HABIT_CONFIG.getVizSettings({
      ...SETTINGS,
      "habit.values": "percent",
    });

    expect(vizSettings["graph.y_axis.title_text"]).toBe("Percent of total");
    expect(vizSettings.column_settings?.[PEOPLE_KEY]).toEqual({
      number_style: "percent",
    });
  });
});

describe("HABIT_CONFIG.describeDrill", () => {
  const getDrill = (value: Lib.AnalysisDrillValue): Lib.AnalysisDrill => ({
    type: "actors",
    dimensions: [
      {
        column_ref: ["field", "periods", { "base-type": "type/Integer" }],
        value,
      },
    ],
  });

  it.each([
    { granularity: "day", periods: 1, label: "People active on 1 day" },
    { granularity: "day", periods: 6, label: "People active on 6 days" },
    { granularity: "week", periods: 1, label: "People active in 1 week" },
    { granularity: "week", periods: 3, label: "People active in 3 weeks" },
  ] as const)(
    "describes people active in $periods periods by $granularity",
    ({ granularity, periods, label }) => {
      expect(
        HABIT_CONFIG.describeDrill(
          { ...SETTINGS, granularity },
          getDrill(periods),
        ),
      ).toBe(label);
    },
  );

  it("can't describe a cell without a number of periods", () => {
    expect(HABIT_CONFIG.describeDrill(SETTINGS, getDrill(null))).toBeNull();
    expect(
      HABIT_CONFIG.describeDrill(SETTINGS, {
        type: "actors",
        dimensions: [
          {
            column_ref: ["field", "people", { "base-type": "type/Integer" }],
            value: 6,
          },
        ],
      }),
    ).toBeNull();
  });
});
