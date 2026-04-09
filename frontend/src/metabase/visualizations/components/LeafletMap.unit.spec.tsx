import { render } from "@testing-library/react";
import L from "leaflet";
import { createRef } from "react";

import MetabaseSettings from "metabase/lib/settings";
import type { Point } from "metabase-types/api/dataset";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

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
    metadata: undefined,
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
