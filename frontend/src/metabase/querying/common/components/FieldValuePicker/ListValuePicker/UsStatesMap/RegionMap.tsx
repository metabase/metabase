import * as d3 from "d3";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useMemo } from "react";

import S from "./UsStatesMap.module.css";

export interface RegionMapProps {
  /** Values that the column has, by upper-case region code. */
  valuesByCode: Map<string, string>;
  selectedValues: string[];
  /** Width of the map in CSS pixels. */
  width?: number;
  /**
   * The share of the rows with each value, from 0 to 1. When it is set, the
   * shade of each region shows its share.
   */
  getShare?: (value: string) => number;
  onToggle: (value: string) => void;
}

interface Region {
  code: string;
  name: string;
  feature: Feature<Geometry>;
}

interface Props extends RegionMapProps {
  regions: Region[];
  getProjection: (
    width: number,
    collection: FeatureCollection<Geometry>,
  ) => d3.GeoProjection;
}

/**
 * Prototype: a map that picks values by region, like US states or countries.
 * The maps are in the bundle, not loaded at runtime like the region map
 * visualization does.
 */
export function RegionMap({
  regions,
  getProjection,
  valuesByCode,
  selectedValues,
  width = 256,
  getShare,
  onToggle,
}: Props) {
  const { paths, height } = useMemo(() => {
    const collection: FeatureCollection<Geometry> = {
      type: "FeatureCollection",
      features: regions.map((region) => region.feature),
    };
    const path = d3.geoPath(getProjection(width, collection));
    const [, [, bottom]] = path.bounds(collection);
    return {
      paths: regions.map(({ code, name, feature }) => ({
        code,
        name,
        d: path(feature) ?? "",
      })),
      height: Math.ceil(bottom),
    };
  }, [regions, getProjection, width]);

  const selectedValuesSet = new Set(selectedValues);
  // The region with the largest share gets the darkest shade. The square root
  // keeps small shares visible next to one large share.
  const maxShare =
    getShare != null
      ? Math.max(...Array.from(valuesByCode.values(), getShare), 0)
      : 0;
  const getShade = (value: string) =>
    getShare != null && maxShare > 0
      ? Math.sqrt(getShare(value) / maxShare)
      : undefined;

  return (
    <svg
      className={S.map}
      style={{ width }}
      viewBox={`0 0 ${width} ${height}`}
      role="group"
    >
      {paths.map(({ code, name, d }) => {
        const value = valuesByCode.get(code);
        const shade = value != null ? getShade(value) : undefined;
        return (
          <path
            key={code}
            className={S.state}
            style={shade != null ? getShadeStyle(shade) : undefined}
            data-shaded={shade != null}
            d={d}
            data-available={value != null}
            data-selected={value != null && selectedValuesSet.has(value)}
            onClick={value != null ? () => onToggle(value) : undefined}
          >
            <title>{name}</title>
          </path>
        );
      })}
    </svg>
  );
}

/** The CSS variable with the shade, as a style. */
function getShadeStyle(shade: number): Record<string, string> {
  return { "--state-shade": `${Math.round(shade * 100)}%` };
}
