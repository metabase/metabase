import {
  type RetentionCurvesView,
  getCohortTableSettings,
  getRetentionCurvesSettings,
} from "./retention-curves";

const VIEW: RetentionCurvesView = {
  period: "week",
  isPercent: true,
  lines: "each",
  xAxis: "sinceStart",
};

describe("getRetentionCurvesSettings", () => {
  it("draws a line per cohort over the period offsets", () => {
    const settings = getRetentionCurvesSettings(VIEW);
    expect(settings["graph.dimensions"]).toEqual(["offset", "cohort"]);
    expect(settings["graph.metrics"]).toEqual(["value"]);
    expect(settings["graph.x_axis.scale"]).toBe("ordinal");
    expect(settings["graph.x_axis.title_text"]).toBe("Weeks since start");
  });

  it("titles the average line", () => {
    const settings = getRetentionCurvesSettings({ ...VIEW, lines: "average" });
    expect(settings.series_settings?.value?.title).toBe("All cohorts");
  });

  it("formats percentages only when the chart shows them", () => {
    expect(getRetentionCurvesSettings(VIEW).column_settings).toBeDefined();
    expect(
      getRetentionCurvesSettings({ ...VIEW, isPercent: false }).column_settings,
    ).toBeUndefined();
  });
});

describe("getCohortTableSettings", () => {
  it("shows the cohort period and the value format", () => {
    expect(getCohortTableSettings({ period: "day", isPercent: false })).toEqual(
      {
        "cohort.period": "day",
        "cohort.value_format": "counts",
      },
    );
  });
});
