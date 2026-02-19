import { render } from "@testing-library/react";
import L from "leaflet";
import { createRef } from "react";

import MetabaseSettings from "metabase/lib/settings";

import { LeafletMap } from "./LeafletMap";

describe("LeafletMap", () => {
  const createProps = (overrides = {}) => ({
    series: [
      {
        card: {},
        data: {
          cols: [{ name: "lat" }, { name: "lng" }],
        },
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
    metadata: {},
    ...overrides,
  });

  beforeEach(() => {
    jest.spyOn(MetabaseSettings, "get").mockImplementation((key) => {
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
      const ref = createRef();
      const { rerender } = render(<LeafletMap ref={ref} {...initialProps} />);
      const mapInstance = ref.current.map;

      const setZoomSpy = jest.spyOn(mapInstance, "setZoom");
      const setViewSpy = jest.spyOn(mapInstance, "setView");

      const updatedProps = createProps({ points: initialProps.points });
      rerender(<LeafletMap ref={ref} {...updatedProps} />);

      expect(setZoomSpy).not.toHaveBeenCalled();
      expect(setViewSpy).not.toHaveBeenCalled();
    });

    it("should recalculate zoom when points do change", () => {
      const initialProps = createProps();
      const ref = createRef();
      const { rerender } = render(<LeafletMap ref={ref} {...initialProps} />);
      const mapInstance = ref.current.map;

      const setZoomSpy = jest.spyOn(mapInstance, "setZoom");
      const setViewSpy = jest.spyOn(mapInstance, "setView");

      const differentPoints = [
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
