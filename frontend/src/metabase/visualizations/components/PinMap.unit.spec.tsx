import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import MetabaseSettings from "metabase/utils/settings";
import { createMockVisualizationProps } from "metabase/visualizations/types/mocks";
import type { RowValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { PinMap, getPoints } from "./PinMap";

const createData = (cols: string[], rows: RowValue[][]) =>
  createMockDatasetData({
    cols: cols.map((name) => createMockColumn({ name })),
    rows,
  });

describe("getPoints", () => {
  it("should filter out rows with null values in either the lat, long, or metric column", () => {
    const { points, warnings } = getPoints({
      data: createData(
        ["lat", "lng", "metric"],
        [
          [null, 0, 0],
          [0, null, 0],
          [0, 0, null],
          [0, 0, 0],
        ],
      ),
      latitudeColumnName: "lat",
      longitudeColumnName: "lng",
      metricColumnName: "metric",
    });

    expect(points).toEqual([[0, 0, 0]]);
    expect(warnings).toEqual([
      "We filtered out 3 row(s) containing null values.",
    ]);
  });

  it("should filter out rows only if the lat or long values are null for pin maps", () => {
    const { points, warnings } = getPoints({
      data: createData(
        ["lat", "lng", "metric"],
        [
          [null, 0, 0],
          [0, null, 0],
          [0, 0, null],
          [1, 2, null],
          [0, 0, 0],
        ],
      ),
      latitudeColumnName: "lat",
      longitudeColumnName: "lng",
      metricColumnName: "metric",
      isPinMap: true,
    });

    expect(points).toEqual([
      [0, 0, null],
      [1, 2, null],
      [0, 0, 0],
    ]);
    expect(warnings).toEqual([
      "We filtered out 2 row(s) containing null values.",
    ]);
  });

  it("should return no warnings when no rows are filtered out", () => {
    const { points, warnings } = getPoints({
      data: createData(
        ["lat", "lng", "metric"],
        [
          [0, 0, 0],
          [1, 2, 3],
        ],
      ),
      latitudeColumnName: "lat",
      longitudeColumnName: "lng",
      metricColumnName: "metric",
    });

    expect(points).toEqual([
      [0, 0, 0],
      [1, 2, 3],
    ]);
    expect(warnings).toEqual([]);
  });

  it("should fall back to world bounds when all rows are filtered out", () => {
    const { points, bounds, warnings } = getPoints({
      data: createData(["lat", "lng", "metric"], [[null, null, null]]),
      latitudeColumnName: "lat",
      longitudeColumnName: "lng",
      metricColumnName: "metric",
    });

    expect(points).toEqual([]);
    expect([
      bounds.getSouth(),
      bounds.getWest(),
      bounds.getNorth(),
      bounds.getEast(),
    ]).toEqual([-90, -180, 90, 180]);
    expect(warnings).toEqual([
      "We filtered out 1 row(s) containing null values.",
    ]);
  });

  it("should extend the bounds by one bin to the north/east for binned coordinates", () => {
    const { bounds } = getPoints({
      data: createMockDatasetData({
        cols: [
          createMockColumn({ name: "lat", binning_info: { bin_width: 2 } }),
          createMockColumn({ name: "lng", binning_info: { bin_width: 3 } }),
          createMockColumn({ name: "metric" }),
        ],
        rows: [[10, 20, 1]],
      }),
      latitudeColumnName: "lat",
      longitudeColumnName: "lng",
      metricColumnName: "metric",
    });

    expect([
      bounds.getSouth(),
      bounds.getWest(),
      bounds.getNorth(),
      bounds.getEast(),
    ]).toEqual([10, 20, 12, 23]);
  });
});

describe("PinMap", () => {
  const setup = ({
    isDashboard = false,
    token,
  }: { isDashboard?: boolean; token?: string } = {}) => {
    const onRender = jest.fn();

    const series = [
      createMockSingleSeries(
        {
          dataset_query: createMockStructuredDatasetQuery({
            database: SAMPLE_DB_ID,
            query: { "source-table": ORDERS_ID },
          }),
        },
        {
          data: createData(
            ["lat", "lng"],
            [
              [10, 20],
              [null, 30],
            ],
          ),
        },
      ),
    ];

    const props = createMockVisualizationProps({
      series,
      rawSeries: series,
      data: series[0].data,
      card: series[0].card,
      settings: {
        "map.type": "pin",
        "map.pin_type": "markers",
        "map.latitude_column": "lat",
        "map.longitude_column": "lng",
      },
      metadata: createMockMetadata({ databases: [createSampleDatabase()] }),
      isDashboard,
      height: 300,
      onRender,
    });

    const { rerender } = render(<PinMap {...props} token={token} />);

    return { onRender, props, rerender };
  };

  beforeEach(() => {
    jest.spyOn(MetabaseSettings, "get").mockImplementation((key: string) => {
      if (key === "map-tile-server-url") {
        return "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
      }
      return null;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should render the 'Set as default view' button with the PinMapUpdateButton class", () => {
    setup();

    const button = screen.getByText("Set as default view");
    expect(button).toHaveClass("PinMapUpdateButton");
  });

  it("should render the 'Draw box to filter' button outside dashboards", async () => {
    setup();

    const button = await screen.findByText("Draw box to filter");
    expect(button).toHaveClass("PinMapUpdateButton");
  });

  it("should report rows filtered out because of null coordinates through onRender", () => {
    const { onRender } = setup();

    expect(onRender).toHaveBeenCalledWith({
      warnings: ["We filtered out 1 row(s) containing null values."],
    });
  });

  it("should not render the 'Set as default view' button for static embedding", () => {
    setup({ token: "token" });

    expect(screen.queryByText("Set as default view")).not.toBeInTheDocument();
  });

  it("should not render either map button on dashboards outside editing", async () => {
    setup({ isDashboard: true });

    expect(await screen.findByText("OpenStreetMap")).toBeInTheDocument();
    expect(screen.queryByText("Set as default view")).not.toBeInTheDocument();
    expect(screen.queryByText("Draw box to filter")).not.toBeInTheDocument();
  });

  it("should toggle the filter button label when starting a box filter", async () => {
    setup();

    await userEvent.click(await screen.findByText("Draw box to filter"));

    expect(screen.getByText("Cancel filter")).toBeInTheDocument();
    expect(screen.queryByText("Draw box to filter")).not.toBeInTheDocument();
  });

  it("should clear the map instance when switching to a pin type with no renderer", async () => {
    const { props, rerender } = setup();

    expect(await screen.findByText("Draw box to filter")).toBeInTheDocument();

    rerender(
      <PinMap
        {...props}
        settings={{ ...props.settings, "map.pin_type": "heat" }}
      />,
    );

    expect(screen.queryByText("Draw box to filter")).not.toBeInTheDocument();
  });
});
