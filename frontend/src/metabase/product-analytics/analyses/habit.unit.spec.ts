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
