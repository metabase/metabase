import React from "react";
import { mount } from "enzyme";

// these tests use ChartSettings directly, but logic we're testing lives in ChartNestedSettingSeries
import ChartSettings from "metabase/visualizations/components/ChartSettings";

function getSeries(display) {
  return [
    {
      card: { display, visualization_settings: {} },
      data: {
        rows: [["a", 1], ["b", 2]],
        cols: [{ name: "foo" }, { name: "bar" }],
      },
    },
  ];
}
describe("ChartNestedSettingSeries", () => {
  it("shouldn't show line/area/bar buttons for row charts", () => {
    const settings = mount(
      <ChartSettings
        series={getSeries("row")}
        initial={{ section: "Display" }}
      />,
    );

    expect(settings.find(".Icon-line")).toHaveLength(0);
    expect(settings.find(".Icon-area")).toHaveLength(0);
    expect(settings.find(".Icon-bar")).toHaveLength(0);
  });

  it("should show line/area/bar buttons for bar charts", () => {
    const settings = mount(
      <ChartSettings
        series={getSeries("bar")}
        initial={{ section: "Display" }}
      />,
    );

    expect(settings.find(".Icon-line")).toHaveLength(1);
    expect(settings.find(".Icon-area")).toHaveLength(1);
    expect(settings.find(".Icon-bar")).toHaveLength(1);
  });
});
