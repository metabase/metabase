import {
  DEFAULT_SETTINGS,
  MOCK_RAW_SERIES,
} from "metabase/visualizations/echarts/pie/test";
import { computeStaticPieChartSettings } from "./setttings";

const STORED_SETTINGS = {
  "pie.dimension": "DIMENSION",
  "pie.metric": "metric",
  "pie.show_legend": false,
  "pie.show_total": false,
  "pie.percent_visibility": "off" as const,
  "pie.slice_threshold": 5,
  "pie.colors": {
    Doohickey: "#e68a76",
    Gadget: "#76e696",
    Gizmo: "#525de1",
    Widget: "#dc52e1",
  },
};

describe("computeStaticPieChartSettings", () => {
  it("should replace empty values in stored settings with defaults", () => {
    const { column, ...computedSettings } =
      computeStaticPieChartSettings(MOCK_RAW_SERIES);

    expect(typeof column).toBe("function");
    expect(computedSettings).toStrictEqual(DEFAULT_SETTINGS);
  });

  it("should not replace non-empty values in stored settings", () => {
    const rawSeries = [{ ...MOCK_RAW_SERIES[0] }];
    rawSeries[0].card.visualization_settings = { ...STORED_SETTINGS };

    const { column, ...computedSettings } =
      computeStaticPieChartSettings(rawSeries);

    expect(typeof column).toBe("function");
    expect(computedSettings).toStrictEqual(STORED_SETTINGS);
  });
});
