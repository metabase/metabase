import * as d3 from "d3";
import type { FeatureCollection, Geometry } from "geojson";

import usStatesGeoJson from "assets/geojson/us-states.json";

import { RegionMap, type RegionMapProps } from "./RegionMap";

type StateProperties = { STATE: string; NAME: string };

const STATES =
  // The JSON import gets a wide type. The file is a GeoJSON feature
  // collection with these properties.
  (
    usStatesGeoJson as FeatureCollection<Geometry, StateProperties>
  ).features.map((feature) => ({
    code: feature.properties.STATE,
    name: feature.properties.NAME,
    feature,
  }));

const getProjection = (
  width: number,
  collection: FeatureCollection<Geometry>,
) => d3.geoAlbersUsa().fitWidth(width, collection);

export function UsStatesMap(props: RegionMapProps) {
  return (
    <RegionMap regions={STATES} getProjection={getProjection} {...props} />
  );
}
