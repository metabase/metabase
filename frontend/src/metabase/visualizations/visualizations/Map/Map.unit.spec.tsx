import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  fireEvent,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import type {
  DatasetColumn,
  RawSeries,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import { PEOPLE } from "metabase-types/api/mocks/presets";

registerVisualizations();

beforeAll(() => loadVisualizationComponents(["map"]));

const MAP_WIDTH = 1280;
const MAP_HEIGHT = 800;

type SetupOpts = {
  rawSeries: RawSeries;
  isDashboard?: boolean;
};

function setup({ rawSeries, isDashboard = false }: SetupOpts) {
  const { rerender } = renderWithProviders(
    <Visualization rawSeries={rawSeries} isDashboard={isDashboard} />,
    { storeInitialState: createMockState({ settings: mockSettings() }) },
  );

  return {
    rerender: (nextRawSeries: RawSeries) =>
      rerender(
        <Visualization rawSeries={nextRawSeries} isDashboard={isDashboard} />,
      ),
  };
}

function getMapSeries({
  cols,
  rows,
  settings,
}: {
  cols: DatasetColumn[];
  rows: RowValue[][];
  settings: VisualizationSettings;
}): RawSeries {
  return [
    {
      card: createMockCard({
        display: "map",
        visualization_settings: settings,
      }),
      data: createMockDatasetData({ cols, rows }),
    },
  ];
}

// Leaflet draws markers and grid cells as unnamed images and paths
const getMarkers = () =>
  // eslint-disable-next-line testing-library/no-node-access -- see above
  Array.from(document.querySelectorAll<HTMLElement>(".leaflet-marker-icon"));

const getGridCells = () =>
  // eslint-disable-next-line testing-library/no-node-access -- see above
  Array.from(document.querySelectorAll<SVGElement>("path.leaflet-interactive"));

const getTooltipRows = async () => {
  const tooltip = await screen.findByRole("tooltip");
  return within(tooltip)
    .getAllByRole("row")
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    );
};

const nativeColumn = (name: string, opts: Partial<DatasetColumn> = {}) =>
  createMockColumn({
    name,
    display_name: name,
    base_type: "type/Float",
    source: "native",
    ...opts,
  });

const binnedColumn = (
  name: "LATITUDE" | "LONGITUDE",
  displayName: string,
): DatasetColumn =>
  createMockColumn({
    name,
    display_name: displayName,
    base_type: "type/Float",
    semantic_type: name === "LATITUDE" ? "type/Latitude" : "type/Longitude",
    source: "breakout",
    binning_info: { binning_strategy: "bin-width", bin_width: 10 },
  });

describe("Map", () => {
  beforeEach(() => {
    jest
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(MAP_WIDTH);
    jest
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(MAP_HEIGHT);
    jest
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockReturnValue(MAP_WIDTH);
    jest
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(MAP_HEIGHT);
    // ChartTooltip opens only over an element with a size
    mockGetBoundingClientRect({ width: MAP_WIDTH, height: MAP_HEIGHT });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("pin map", () => {
    it("should draw a marker for every row when the longitude is the first column (metabase#14254)", async () => {
      const rows = Array.from({ length: 10 }, (_, index) => [
        -100 + index,
        30 + index,
        `City ${index}`,
      ]);
      setup({
        rawSeries: getMapSeries({
          cols: [
            nativeColumn("LONGITUDE", { semantic_type: "type/Longitude" }),
            nativeColumn("LATITUDE", { semantic_type: "type/Latitude" }),
            nativeColumn("CITY", {
              base_type: "type/Text",
              semantic_type: "type/City",
            }),
          ],
          rows,
          settings: {
            "map.region": "us_states",
            "map.type": "pin",
            "map.latitude_column": "LATITUDE",
            "map.longitude_column": "LONGITUDE",
          },
        }),
      });

      await waitFor(() => expect(getMarkers()).toHaveLength(10));
    });

    it("should wrap markers around the international date line and keep tooltips after zooming (metabase#5369, metabase#64939)", async () => {
      setup({
        rawSeries: getMapSeries({
          cols: [
            nativeColumn("NAME", { base_type: "type/Text" }),
            nativeColumn("LAT", { base_type: "type/Integer" }),
            nativeColumn("LNG", { base_type: "type/Integer" }),
          ],
          rows: [
            ["Kleavor", 68, -159],
            ["Spectrier", 68, 159],
            ["Blastoise", 68, 22],
          ],
          settings: {
            "map.region": "world",
            "map.type": "pin",
            "map.latitude_column": "LAT",
            "map.longitude_column": "LNG",
            "map.center_latitude": 67,
            "map.center_longitude": -175,
            "map.zoom": 1,
          },
        }),
      });

      // the view spans the date line, so each point gets a copy on the other side
      await waitFor(() => expect(getMarkers()).toHaveLength(6));

      // markers come in [point, copy] pairs, so the last one is Blastoise's copy
      const blastoise = getMarkers()[5];
      fireEvent.mouseMove(blastoise);
      expect(await getTooltipRows()).toEqual([
        ["NAME:", "Blastoise"],
        ["LAT:", "68"],
        ["LNG:", "22"],
      ]);
      fireEvent.mouseOut(blastoise);

      // zooming in around Blastoise leaves the date line out of view
      fireEvent.wheel(blastoise, {
        deltaY: -100,
        clientX: parseFloat(blastoise.style.left),
        clientY: parseFloat(blastoise.style.top),
      });
      await waitFor(() => expect(getMarkers()).toHaveLength(3));

      fireEvent.mouseMove(getMarkers()[2]);
      expect(await getTooltipRows()).toEqual([
        ["NAME:", "Blastoise"],
        ["LAT:", "68"],
        ["LNG:", "22"],
      ]);
    });

    it("should show the details of the hovered row when rows with null coordinates come first (metabase#18063)", async () => {
      setup({
        rawSeries: getMapSeries({
          cols: [
            nativeColumn("LATITUDE"),
            nativeColumn("LONGITUDE"),
            nativeColumn("COUNT", { base_type: "type/Integer" }),
            nativeColumn("NAME", { base_type: "type/Text" }),
          ],
          rows: [
            [null, null, null, "NULL ROW"],
            [55.6761, 12.5683, 1, "Copenhagen"],
            [59.9139, 10.7522, 2, "Oslo"],
          ],
          settings: {
            "map.type": "pin",
            "map.latitude_column": "LATITUDE",
            "map.longitude_column": "LONGITUDE",
          },
        }),
      });

      await waitFor(() => expect(getMarkers()).toHaveLength(2));

      fireEvent.mouseMove(getMarkers()[1]);
      expect(await getTooltipRows()).toEqual([
        ["LATITUDE:", "59.91"],
        ["LONGITUDE:", "10.75"],
        ["COUNT:", "2"],
        ["NAME:", "Oslo"],
      ]);
      fireEvent.mouseOut(getMarkers()[1]);

      fireEvent.mouseMove(getMarkers()[0]);
      expect(await getTooltipRows()).toEqual([
        ["LATITUDE:", "55.68"],
        ["LONGITUDE:", "12.57"],
        ["COUNT:", "1"],
        ["NAME:", "Copenhagen"],
      ]);
    });

    describe("rows whose coordinates are all null (metabase#18061)", () => {
      const cols = [
        createMockColumn({
          name: "ID",
          display_name: "ID",
          base_type: "type/BigInteger",
          semantic_type: "type/PK",
        }),
        createMockColumn({
          name: "LATITUDE",
          display_name: "Latitude",
          base_type: "type/Float",
          semantic_type: "type/Latitude",
        }),
        createMockColumn({
          name: "LONGITUDE",
          display_name: "Longitude",
          base_type: "type/Float",
          semantic_type: "type/Longitude",
        }),
        createMockColumn({
          name: "CClat",
          display_name: "CClat",
          base_type: "type/Float",
          source: "fields",
        }),
        createMockColumn({
          name: "CClong",
          display_name: "CClong",
          base_type: "type/Float",
          source: "fields",
        }),
      ];
      // the map type is left to its default, as in the saved question
      const settings: VisualizationSettings = {
        "map.latitude_column": "CClat",
        "map.longitude_column": "CClong",
      };
      const nullRow = [1, 40.71, -74.01, null, null];
      const pointRow = [2, 41.88, -87.63, 41.88, -87.63];

      it("should render an empty pin map in the query builder", async () => {
        setup({ rawSeries: getMapSeries({ cols, rows: [nullRow], settings }) });

        const pinMap = await screen.findByTestId("visualization-root");
        await waitFor(() =>
          expect(
            // eslint-disable-next-line testing-library/no-node-access -- leaflet renders no accessible map element
            pinMap.querySelector(
              "[data-element-id=pin-map] .leaflet-container",
            ),
          ).toBeInTheDocument(),
        );
        expect(getMarkers()).toHaveLength(0);
      });

      it("should render the pin map on a dashboard, then no results when a filter leaves no rows", async () => {
        const { rerender } = setup({
          rawSeries: getMapSeries({
            cols,
            rows: [nullRow, pointRow],
            settings,
          }),
          isDashboard: true,
        });

        // the result is passed in with the first render
        expect(screen.queryByAltText("No results")).not.toBeInTheDocument();
        await waitFor(() => expect(getMarkers()).toHaveLength(1));

        rerender(getMapSeries({ cols, rows: [], settings }));

        await waitFor(() =>
          expect(
            // eslint-disable-next-line testing-library/no-node-access -- leaflet renders no accessible map element
            document.querySelector("[data-element-id=pin-map]"),
          ).not.toBeInTheDocument(),
        );
        expect(screen.getByAltText("No results")).toBeInTheDocument();
      });
    });

    describe("breakouts whose field refs set a base type (metabase#40999)", () => {
      const cols = [
        createMockColumn({
          ...binnedColumn("LONGITUDE", "Longitude"),
          binning_info: null,
          id: PEOPLE.LONGITUDE,
          field_ref: ["field", PEOPLE.LONGITUDE, { "base-type": "type/Float" }],
        }),
        createMockColumn({
          ...binnedColumn("LATITUDE", "Latitude"),
          binning_info: null,
          id: PEOPLE.LATITUDE,
          field_ref: ["field", PEOPLE.LATITUDE, { "base-type": "type/Float" }],
        }),
        createMockColumn({
          name: "count",
          display_name: "Count",
          base_type: "type/BigInteger",
          source: "aggregation",
        }),
      ];
      // 1,000 rows make tiles the default pin type
      const rows = Array.from({ length: 1000 }, (_, index) => [
        -120 + (index % 50),
        30 + Math.floor(index / 50),
        1,
      ]);
      const settings: VisualizationSettings = {
        "map.type": "pin",
        "map.latitude_column": "LATITUDE",
        "map.longitude_column": "LONGITUDE",
      };

      it("should request pin tiles for the base-type field refs", async () => {
        setup({ rawSeries: getMapSeries({ cols, rows, settings }) });

        await waitFor(() =>
          expect(
            screen
              .getAllByRole("presentation")
              .some((tile) =>
                tile.getAttribute("src")?.startsWith("/api/tiles/"),
              ),
          ).toBe(true),
        );
        const pinTile = screen
          .getAllByRole("presentation")
          .find((tile) => tile.getAttribute("src")?.startsWith("/api/tiles/"));
        const tileUrl = new URL(
          String(pinTile?.getAttribute("src")),
          "http://localhost",
        );
        expect(tileUrl.searchParams.get("latField")).toBe(
          JSON.stringify([
            "field",
            PEOPLE.LATITUDE,
            { "base-type": "type/Float" },
          ]),
        );
        expect(tileUrl.searchParams.get("lonField")).toBe(
          JSON.stringify([
            "field",
            PEOPLE.LONGITUDE,
            { "base-type": "type/Float" },
          ]),
        );
      });

      it("should offer the pin type setting", async () => {
        const onChange = jest.fn<void, [VisualizationSettings, unknown]>();
        const [series] = getMapSeries({ cols, rows, settings });
        renderWithProviders(
          <QuestionChartSettings
            series={[series]}
            onChange={onChange}
            initial={{ section: "Data" }}
          />,
        );

        expect(screen.getByText("Pin type")).toBeInTheDocument();
        await userEvent.click(screen.getByLabelText("Pin type"));
        await userEvent.click(
          await screen.findByRole("option", { name: "Markers" }),
        );

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][0]).toMatchObject({
          "map.pin_type": "markers",
        });
      });

      it("should draw a marker for every row with the markers pin type", async () => {
        setup({
          rawSeries: getMapSeries({
            cols,
            rows,
            settings: { ...settings, "map.pin_type": "markers" },
          }),
        });

        await waitFor(() => expect(getMarkers()).toHaveLength(1000));
      });
    });
  });

  describe("grid map", () => {
    it("should show the cell coordinates in the tooltip without a metric column (metabase#17940)", async () => {
      setup({
        rawSeries: getMapSeries({
          cols: [
            binnedColumn("LONGITUDE", "Longitude: 10°"),
            binnedColumn("LATITUDE", "Latitude: 10°"),
          ],
          rows: [
            [-80, 30],
            [-70, 40],
          ],
          settings: {
            "map.type": "grid",
            "table.pivot_column": "LATITUDE",
            "table.cell_column": "LONGITUDE",
          },
        }),
      });

      await waitFor(() => expect(getGridCells()).toHaveLength(2));

      fireEvent.mouseMove(getGridCells()[1]);
      expect(await getTooltipRows()).toEqual([
        ["Latitude: 10°:", "40° N  –  50° N"],
        ["Longitude: 10°:", "70° W  –  60° W"],
        ["", "1"],
      ]);
    });

    it("should redraw with fewer cells after a filter (metabase#30058)", async () => {
      const cols = [
        binnedColumn("LATITUDE", "Latitude: 10°"),
        binnedColumn("LONGITUDE", "Longitude: 10°"),
        createMockColumn({
          name: "count",
          display_name: "Count",
          base_type: "type/BigInteger",
          source: "aggregation",
        }),
      ];
      const settings: VisualizationSettings = { "map.type": "grid" };
      const { rerender } = setup({
        rawSeries: getMapSeries({
          cols,
          rows: [
            [30, -80, 1],
            [40, -70, 3],
            [50, -60, 5],
          ],
          settings,
        }),
      });
      await waitFor(() => expect(getGridCells()).toHaveLength(3));

      rerender(
        getMapSeries({
          cols,
          rows: [
            [40, -70, 3],
            [50, -60, 5],
          ],
          settings,
        }),
      );

      await waitFor(() => expect(getGridCells()).toHaveLength(2));
      expect(
        screen.queryByText(/Cannot read properties of undefined/),
      ).not.toBeInTheDocument();
    });
  });
});
