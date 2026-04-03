import * as LibMetric from "metabase-lib/metric";

import {
  GEO_DIM_IDX,
  GEO_METRIC,
  createMetricMetadata,
  setupDefinition,
} from "./__tests__/test-helpers";
import { getMapRegionForDimension } from "./geo-dimensions";

const metadata = createMetricMetadata([GEO_METRIC]);
const geoDefinition = setupDefinition(metadata, GEO_METRIC.id);
const geoDimensions = LibMetric.projectionableDimensions(geoDefinition);

describe("getMapRegionForDimension", () => {
  it("returns us_states for state dimensions", () => {
    expect(getMapRegionForDimension(geoDimensions[GEO_DIM_IDX.STATE])).toBe(
      "us_states",
    );
  });

  it("returns world_countries for country dimensions", () => {
    expect(getMapRegionForDimension(geoDimensions[GEO_DIM_IDX.COUNTRY])).toBe(
      "world_countries",
    );
  });

  it("returns null for city dimensions", () => {
    expect(
      getMapRegionForDimension(geoDimensions[GEO_DIM_IDX.CITY]),
    ).toBeNull();
  });

  it("returns null for latitude dimensions", () => {
    expect(
      getMapRegionForDimension(geoDimensions[GEO_DIM_IDX.LATITUDE]),
    ).toBeNull();
  });

  it("returns null for longitude dimensions", () => {
    expect(
      getMapRegionForDimension(geoDimensions[GEO_DIM_IDX.LONGITUDE]),
    ).toBeNull();
  });

  it("returns null for datetime dimensions", () => {
    expect(
      getMapRegionForDimension(geoDimensions[GEO_DIM_IDX.DATE_TIME]),
    ).toBeNull();
  });
});
