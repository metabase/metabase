import { fireEvent, render } from "@testing-library/react";
import L from "leaflet";
import { createRef } from "react";

import { createMockMetadata } from "__support__/metadata";
import { mockGetBoundingClientRect } from "__support__/ui";
import MetabaseSettings from "metabase/utils/settings";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { UnsavedCard } from "metabase-types/api";
import type { Point } from "metabase-types/api/dataset";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import {
  PEOPLE,
  PEOPLE_ID,
  createPeopleLatitudeField,
  createPeopleLongitudeField,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  LeafletMap,
  type LeafletMapProps,
  isOpenStreetMapHost,
} from "./LeafletMap";

describe("LeafletMap", () => {
  const createProps = (
    overrides: Partial<LeafletMapProps> = {},
  ): LeafletMapProps => ({
    series: [
      {
        card: createMockCard(),
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "lat" }),
            createMockColumn({ name: "lng" }),
          ],
        }),
      },
    ],
    settings: {
      "map.latitude_column": "lat",
      "map.longitude_column": "lng",
    },
    bounds: L.latLngBounds([
      [0, 0],
      [10, 10],
    ]),
    points: [
      [1, 1],
      [2, 2],
      [3, 3],
    ],
    onMapCenterChange: jest.fn(),
    onMapZoomChange: jest.fn(),
    onRenderError: jest.fn(),
    onFiltering: jest.fn(),
    onChangeCardAndRun: jest.fn(),
    buildQuestion: (card: UnsavedCard) =>
      new Question(card, createMockMetadata()),
    ...overrides,
  });

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

  describe("zoom preservation on component update", () => {
    it("should not recalculate zoom if points did not change", () => {
      const initialProps = createProps();
      const ref = createRef<LeafletMap>();
      const { rerender } = render(<LeafletMap ref={ref} {...initialProps} />);
      const mapInstance = ref.current?.map;

      expect(mapInstance).toBeDefined();
      const setZoomSpy = jest.spyOn(mapInstance!, "setZoom");
      const setViewSpy = jest.spyOn(mapInstance!, "setView");

      const updatedProps = createProps({ points: initialProps.points });
      rerender(<LeafletMap ref={ref} {...updatedProps} />);

      expect(setZoomSpy).not.toHaveBeenCalled();
      expect(setViewSpy).not.toHaveBeenCalled();
    });

    it("should recalculate zoom when points do change", () => {
      const initialProps = createProps();
      const ref = createRef<LeafletMap>();
      const { rerender } = render(<LeafletMap ref={ref} {...initialProps} />);
      const mapInstance = ref.current?.map;

      expect(mapInstance).toBeDefined();
      const setZoomSpy = jest.spyOn(mapInstance!, "setZoom");
      const setViewSpy = jest.spyOn(mapInstance!, "setView");

      const differentPoints: Point[] = [
        [1, 1],
        [2, 2],
      ];
      const updatedProps = createProps({ points: differentPoints });
      rerender(<LeafletMap ref={ref} {...updatedProps} />);

      expect(setZoomSpy).toHaveBeenCalled();
      expect(setViewSpy).toHaveBeenCalled();
    });
  });
});

describe("LeafletMap box filter (metabase#41056)", () => {
  const MAP_WIDTH = 1280;
  const MAP_HEIGHT = 800;
  const metadata = createMockMetadata({ databases: [createSampleDatabase()] });

  type SetupOpts = {
    from: [number, number];
    to: [number, number];
  };

  // Draws a box over a map zoomed out to the whole world (minimum zoom 2,
  // so 1,024px span 360° of longitude) and returns the filter it applies.
  const drawBox = ({ from, to }: SetupOpts) => {
    const onChangeCardAndRun = jest.fn<void, [{ nextCard: UnsavedCard }]>();
    const onFiltering = jest.fn<void, [boolean]>();
    const ref = createRef<LeafletMap>();
    render(
      <LeafletMap
        ref={ref}
        series={[
          {
            card: createMockCard({
              display: "map",
              dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
                stages: [{ source: { type: "table", id: PEOPLE_ID } }],
              }),
            }),
            data: createMockDatasetData({
              cols: [
                createMockColumn({
                  ...createPeopleLatitudeField(),
                  id: PEOPLE.LATITUDE,
                  source: "fields",
                  field_ref: ["field", PEOPLE.LATITUDE, null],
                }),
                createMockColumn({
                  ...createPeopleLongitudeField(),
                  id: PEOPLE.LONGITUDE,
                  source: "fields",
                  field_ref: ["field", PEOPLE.LONGITUDE, null],
                }),
              ],
              rows: [[10, 20]],
            }),
          },
        ]}
        settings={{
          "map.center_latitude": 0,
          "map.center_longitude": 0,
          "map.zoom": 0,
          "map.latitude_column": "LATITUDE",
          "map.longitude_column": "LONGITUDE",
        }}
        bounds={L.latLngBounds([10, 20], [10, 20])}
        points={[[10, 20]]}
        onMapCenterChange={jest.fn()}
        onMapZoomChange={jest.fn()}
        onRenderError={jest.fn()}
        onFiltering={onFiltering}
        onChangeCardAndRun={onChangeCardAndRun}
        buildQuestion={(card: UnsavedCard) => new Question(card, metadata)}
      />,
    );

    const map = checkNotNull(ref.current);
    map.startFilter();
    expect(onFiltering).toHaveBeenLastCalledWith(true);

    const container = checkNotNull(map.map).getContainer();
    fireEvent.mouseDown(container, { clientX: from[0], clientY: from[1] });
    fireEvent.mouseMove(container, { clientX: to[0], clientY: to[1] });
    fireEvent.mouseUp(document, { clientX: to[0], clientY: to[1] });

    expect(onFiltering).toHaveBeenLastCalledWith(false);
    expect(onChangeCardAndRun).toHaveBeenCalledTimes(1);
    const { nextCard } = onChangeCardAndRun.mock.calls[0][0];
    const query = new Question(nextCard, metadata).query();
    const filters = Lib.filters(query, -1);
    expect(filters).toHaveLength(1);
    const { operator, args } = Lib.expressionParts(query, -1, filters[0]);

    return {
      operator,
      columns: args
        .filter((arg) => Lib.isColumnMetadata(arg))
        .map((column) => Lib.displayInfo(query, -1, column).name),
      bounds: args.filter((arg) => typeof arg === "number"),
      displayName: Lib.displayInfo(query, -1, filters[0]).displayName,
    };
  };

  beforeEach(() => {
    jest.spyOn(MetabaseSettings, "get").mockReturnValue(null);
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
    mockGetBoundingClientRect({ width: MAP_WIDTH, height: MAP_HEIGHT });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should filter on the box drawn when zoomed out", () => {
    const { operator, columns, bounds } = drawBox({
      from: [250, 150],
      to: [500, 250],
    });

    expect(operator).toBe("inside");
    expect(columns).toEqual(["LATITUDE", "LONGITUDE"]);
    // [north, west, south, east]; x 640 is longitude 0
    const [north, west, south, east] = bounds;
    expect(north).toBeCloseTo(65.658, 3);
    expect(west).toBeCloseTo(((250 - 640) * 360) / 1024, 3);
    expect(south).toBeCloseTo(46.559, 3);
    expect(east).toBeCloseTo(((500 - 640) * 360) / 1024, 3);
  });

  it("should wrap the longitudes of a box drawn over the world copy west of the date line", () => {
    const { bounds } = drawBox({ from: [10, 10], to: [20, 20] });

    const [north, west, south, east] = bounds;
    expect(north).toBeCloseTo(79.561, 3);
    expect(west).toBeCloseTo(((10 - 640) * 360) / 1024 + 360, 3);
    expect(south).toBeCloseTo(78.904, 3);
    expect(east).toBeCloseTo(((20 - 640) * 360) / 1024 + 360, 3);
  });

  it("should select every longitude for a box wider than 360°", () => {
    const { bounds, displayName } = drawBox({
      from: [10, 10],
      to: [1270, 600],
    });

    const [north, west, south, east] = bounds;
    expect(north).toBeCloseTo(79.561, 3);
    expect(west).toBe(-180);
    expect(south).toBeCloseTo(-57.327, 3);
    expect(east).toBe(180);
    expect(displayName).toContain("Longitude is between -180 and 180");
  });
});

describe("isOpenStreetMapHost", () => {
  it("should return true for openstreetmap.org", () => {
    expect(isOpenStreetMapHost("openstreetmap.org")).toBe(true);
  });

  it("should return true for valid subdomains", () => {
    expect(isOpenStreetMapHost("tile.openstreetmap.org")).toBe(true);
    expect(isOpenStreetMapHost("a.tile.openstreetmap.org")).toBe(true);
    expect(isOpenStreetMapHost("b.tile.openstreetmap.org")).toBe(true);
    expect(isOpenStreetMapHost("c.tile.openstreetmap.org")).toBe(true);
  });

  it("should return false for domains that contain openstreetmap.org as a substring", () => {
    expect(isOpenStreetMapHost("fakeopenstreetmap.org")).toBe(false);
    expect(isOpenStreetMapHost("not-openstreetmap.org")).toBe(false);
    expect(isOpenStreetMapHost("myopenstreetmap.org")).toBe(false);
  });

  it("should return false for domains where openstreetmap.org is a subdomain", () => {
    expect(isOpenStreetMapHost("openstreetmap.org.evil.com")).toBe(false);
    expect(isOpenStreetMapHost("tile.openstreetmap.org.evil.com")).toBe(false);
  });

  it("should return false for unrelated domains", () => {
    expect(isOpenStreetMapHost("example.com")).toBe(false);
    expect(isOpenStreetMapHost("google.com")).toBe(false);
    expect(isOpenStreetMapHost("")).toBe(false);
  });
});
