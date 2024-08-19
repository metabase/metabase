import PinMap from "metabase/visualizations/components/PinMap";

describe("PinMap", () => {
  it("should filter out rows with null values in either the lat, long, or metric column", () => {
    const onUpdateWarnings = jest.fn();
    const data = {
      cols: ["lat", "lng", "metric"].map(name => ({ name })),
      rows: [
        [null, 0, 0],
        [0, null, 0],
        [0, 0, null],
        [0, 0, 0],
      ],
    };
    const props = {
      settings: {
        "map.latitude_column": "lat",
        "map.longitude_column": "lng",
        "map.metric_column": "metric",
      },
      series: [{ data }],
      onUpdateWarnings,
    };
    const { points } = new PinMap(props)._getPoints(props);

    expect(points).toEqual([[0, 0, 0]]);
    expect(onUpdateWarnings.mock.calls[0][0]).toEqual([
      "We filtered out 3 row(s) containing null values.",
    ]);
  });

  it("should filter out rows only if the lat or long values are null for pin maps", () => {
    const onUpdateWarnings = jest.fn();
    const data = {
      cols: ["lat", "lng", "metric"].map(name => ({ name })),
      rows: [
        [null, 0, 0],
        [0, null, 0],
        [0, 0, null],
        [1, 2, null],
        [0, 0, 0],
      ],
    };
    const props = {
      settings: {
        "map.latitude_column": "lat",
        "map.longitude_column": "lng",
        "map.metric_column": "metric",
        "map.type": "pin",
      },
      series: [{ data }],
      onUpdateWarnings,
    };
    const { points } = new PinMap(props)._getPoints(props);

    expect(points).toEqual([
      [0, 0, null],
      [1, 2, null],
      [0, 0, 0],
    ]);
    expect(onUpdateWarnings.mock.calls[0][0]).toEqual([
      "We filtered out 2 row(s) containing null values.",
    ]);
  });
});
