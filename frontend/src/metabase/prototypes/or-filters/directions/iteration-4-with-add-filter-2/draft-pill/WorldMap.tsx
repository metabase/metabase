import * as d3 from "d3";
import type { FeatureCollection, Geometry } from "geojson";

import worldGeoJson from "assets/geojson/world.json";

import { RegionMap, type RegionMapProps } from "./RegionMap";

type CountryProperties = { ISO_A2: string; NAME: string };

// Antarctica takes much space and has no customers.
const COUNTRIES =
  // The JSON import gets a wide type. The file is a GeoJSON feature
  // collection with these properties.
  (worldGeoJson as FeatureCollection<Geometry, CountryProperties>).features
    .filter((feature) => feature.properties.ISO_A2 !== "AQ")
    .map((feature) => ({
      code: feature.properties.ISO_A2,
      name: feature.properties.NAME,
      feature,
    }));

const getProjection = (
  width: number,
  collection: FeatureCollection<Geometry>,
) => d3.geoNaturalEarth1().fitWidth(width, collection);

export function WorldMap(props: RegionMapProps) {
  return (
    <RegionMap regions={COUNTRIES} getProjection={getProjection} {...props} />
  );
}
