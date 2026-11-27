import userEvent from "@testing-library/user-event";

import {
  fireEvent,
  mockGetBoundingClientRect,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import { PEOPLE, PEOPLE_ID } from "metabase-types/api/mocks/presets";

import { setup } from "./test-utils";

registerVisualizations();

const MAP_WIDTH = 1280;
const MAP_HEIGHT = 800;

// Leaflet draws markers as unnamed images
const getMarkers = () =>
  // eslint-disable-next-line testing-library/no-node-access -- see above
  Array.from(document.querySelectorAll<HTMLElement>(".leaflet-marker-icon"));

const getPinTileUrls = () =>
  screen
    .queryAllByRole("presentation")
    .map((tile) => tile.getAttribute("src") ?? "")
    .filter((src) => src.startsWith("/api/tiles/"));

// The field pickers are not associated with their labels
const getFieldPicker = (settingId: string) =>
  within(
    screen.getByTestId(`chart-settings-widget-${settingId}`),
  ).getByPlaceholderText("Select a field");

const selectField = async (settingId: string, columnName: string) => {
  await userEvent.click(getFieldPicker(settingId));
  await userEvent.click(
    await screen.findByRole("option", { name: columnName }),
  );
};

describe("QueryBuilder map settings", () => {
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

  it("should draw markers after switching a tiled pin map to the markers pin type (metabase#40999)", async () => {
    const card = createMockCard({
      id: 40999,
      name: "40999",
      display: "map",
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: PEOPLE_ID },
            aggregations: [{ type: "operator", operator: "count" }],
            breakouts: [
              { type: "column", fieldId: PEOPLE.LONGITUDE },
              { type: "column", fieldId: PEOPLE.LATITUDE },
            ],
          },
        ],
      }),
      visualization_settings: {
        "map.type": "pin",
        "map.latitude_column": "LATITUDE",
        "map.longitude_column": "LONGITUDE",
      },
    });
    // 1,000 rows make tiles the default pin type
    const rows = Array.from({ length: 1000 }, (_, index) => [
      -120 + (index % 50),
      30 + Math.floor(index / 50),
      1,
    ]);
    const dataset = createMockDataset({
      data: createMockDatasetData({
        cols: [
          createMockColumn({
            id: PEOPLE.LONGITUDE,
            name: "LONGITUDE",
            display_name: "Longitude",
            base_type: "type/Float",
            semantic_type: "type/Longitude",
            source: "breakout",
            field_ref: [
              "field",
              PEOPLE.LONGITUDE,
              { "base-type": "type/Float" },
            ],
          }),
          createMockColumn({
            id: PEOPLE.LATITUDE,
            name: "LATITUDE",
            display_name: "Latitude",
            base_type: "type/Float",
            semantic_type: "type/Latitude",
            source: "breakout",
            field_ref: [
              "field",
              PEOPLE.LATITUDE,
              { "base-type": "type/Float" },
            ],
          }),
          createMockColumn({
            name: "count",
            display_name: "Count",
            base_type: "type/BigInteger",
            source: "aggregation",
          }),
        ],
        rows,
      }),
      row_count: rows.length,
    });

    await setup({ card, dataset });

    await waitFor(() => expect(getPinTileUrls()).not.toHaveLength(0));

    await userEvent.click(screen.getByTestId("viz-settings-button"));
    expect(screen.getByText("Pin type")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Pin type"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Markers" }),
    );

    await waitFor(() => expect(getMarkers()).toHaveLength(1000));
  });

  it("should show the hovered row after picking the coordinates of native results with null rows (metabase#18063)", async () => {
    const card = createMockCard({
      id: 18063,
      name: "18063",
      display: "map",
      query_type: "native",
      dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
        query:
          "select null LATITUDE, null LONGITUDE, null COUNT, 'NULL ROW' NAME union all select 55.6761, 12.5683, 1, 'Copenhagen' union all select 59.9139, 10.7522, 2, 'Oslo'",
      }),
      visualization_settings: {},
    });
    const nativeColumn = (name: string, baseType: string) =>
      createMockColumn({
        name,
        display_name: name,
        base_type: baseType,
        source: "native",
        field_ref: ["field", name, { "base-type": baseType }],
      });
    const rows = [
      [null, null, null, "NULL ROW"],
      [55.6761, 12.5683, 1, "Copenhagen"],
      [59.9139, 10.7522, 2, "Oslo"],
    ];
    const dataset = createMockDataset({
      data: createMockDatasetData({
        cols: [
          nativeColumn("LATITUDE", "type/Float"),
          nativeColumn("LONGITUDE", "type/Float"),
          nativeColumn("COUNT", "type/Integer"),
          nativeColumn("NAME", "type/Text"),
        ],
        rows,
      }),
      row_count: rows.length,
    });

    await setup({ card, dataset });

    await userEvent.click(screen.getByTestId("viz-settings-button"));
    const mapType = screen.getByLabelText("Map type");
    expect(mapType).toHaveValue("Region map");
    await userEvent.click(mapType);
    await userEvent.click(
      await screen.findByRole("option", { name: "Pin map" }),
    );

    // both coordinate pickers open when the pin map is picked, and one click
    // closes them
    expect(await screen.findAllByRole("listbox")).toHaveLength(2);
    await userEvent.click(getFieldPicker("map.latitude_column"));
    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
    );
    expect(getFieldPicker("map.latitude_column")).toHaveValue("");
    expect(getFieldPicker("map.longitude_column")).toHaveValue("");

    await selectField("map.latitude_column", "LATITUDE");
    await selectField("map.longitude_column", "LONGITUDE");

    await waitFor(() => expect(getMarkers()).toHaveLength(2));

    fireEvent.mouseMove(getMarkers()[1]);
    const tooltip = await screen.findByRole("tooltip");
    expect(
      within(tooltip)
        .getAllByRole("row")
        .map((row) =>
          within(row)
            .getAllByRole("cell")
            .map((cell) => cell.textContent),
        ),
    ).toEqual([
      ["LATITUDE:", "59.91"],
      ["LONGITUDE:", "10.75"],
      ["COUNT:", "2"],
      ["NAME:", "Oslo"],
    ]);
  });
});
