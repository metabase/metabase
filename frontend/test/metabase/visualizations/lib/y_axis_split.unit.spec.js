import getYAxisSplit from "metabase/visualizations/lib/y_axis_split";
import { getComputedSettings } from "metabase/visualizations/lib/settings";
import { seriesSetting } from "metabase/visualizations/lib/settings/series";

function createSettings() {
  const defs = seriesSetting();
  return getComputedSettings(defs, [], {});
}

describe("getYAxisSplit", () => {
  it("should assign a single series to the left", () => {
    const series = [
      {
        data: {
          cols: [{ name: "Category" }, { name: "Price" }],
          rows: [["a", 1], ["b", 2]],
        },
        card: { display: "bar" },
      },
    ];
    const settings = createSettings();

    expect(getYAxisSplit(series, settings)).toEqual([[0], []]);
  });

  it("should split series", () => {
    const series = [
      {
        data: {
          cols: [{ name: "Category" }, { name: "Price" }],
          rows: [["a", 1], ["b", 2]],
        },
        card: { display: "bar" },
      },
      {
        data: {
          cols: [{ name: "Category" }, { name: "Not Price" }],
          rows: [["a", 1], ["b", 4]],
        },
        card: { display: "bar" },
      },
    ];
    const settings = createSettings();

    expect(getYAxisSplit(series, settings)).toEqual([[0], [1]]);
  });

  it("shouldn't split series if the y column is the same", () => {
    const series = [
      {
        data: {
          cols: [{ name: "Category" }, { name: "Price" }],
          rows: [["a", 1], ["b", 2]],
        },
        card: { display: "bar" },
      },
      {
        data: {
          cols: [{ name: "Category" }, { name: "Price" }],
          rows: [["a", 1], ["b", 4]],
        },
        card: { display: "bar" },
      },
    ];
    const settings = createSettings();

    expect(getYAxisSplit(series, settings)).toEqual([[0, 1], []]);
  });

  it("shouldn't split series if graph.y_axis.auto_split is turned off", () => {
    const series = [
      {
        data: {
          cols: [{ name: "Category" }, { name: "Price" }],
          rows: [["a", 1], ["b", 2]],
        },
        card: { display: "bar" },
      },
      {
        data: {
          cols: [{ name: "Category" }, { name: "Not Price" }],
          rows: [["a", 1], ["b", 4]],
        },
        card: { display: "bar" },
      },
    ];
    const settings = createSettings();
    settings["graph.y_axis.auto_split"] = false;

    expect(getYAxisSplit(series, settings)).toEqual([[0, 1], []]);
  });
});
