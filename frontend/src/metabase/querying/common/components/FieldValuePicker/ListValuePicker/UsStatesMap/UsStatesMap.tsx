import * as d3 from "d3";
import type { FeatureCollection, Geometry } from "geojson";
import { useMemo } from "react";

import usStatesGeoJson from "assets/geojson/us-states.json";

import S from "./UsStatesMap.module.css";

type StateProperties = { STATE: string; NAME: string };

// Prototype: the map is in the bundle, not loaded at runtime like the
// region map visualization does.
const STATES = usStatesGeoJson as FeatureCollection<Geometry, StateProperties>;

const DEFAULT_WIDTH = 256;

interface UsStatesMapProps {
  /** Values that the column has, by upper-case state code. */
  valuesByCode: Map<string, string>;
  selectedValues: string[];
  /** Width of the map in CSS pixels. */
  width?: number;
  /**
   * The share of the rows with each value, from 0 to 1. When it is set, the
   * shade of each state shows its share.
   */
  getShare?: (value: string) => number;
  onToggle: (value: string) => void;
}

export function UsStatesMap({
  valuesByCode,
  selectedValues,
  width = DEFAULT_WIDTH,
  getShare,
  onToggle,
}: UsStatesMapProps) {
  const { paths, height } = useMemo(() => {
    const projection = d3.geoAlbersUsa().fitWidth(width, STATES);
    const path = d3.geoPath(projection);
    const [, [, bottom]] = path.bounds(STATES);
    return {
      paths: STATES.features.map((feature) => ({
        code: feature.properties.STATE,
        name: feature.properties.NAME,
        d: path(feature) ?? "",
      })),
      height: Math.ceil(bottom),
    };
  }, [width]);

  const selectedValuesSet = new Set(selectedValues);
  // The state with the largest share gets the darkest shade.
  const maxShare =
    getShare != null
      ? Math.max(...Array.from(valuesByCode.values(), getShare), 0)
      : 0;
  const getShade = (value: string) =>
    getShare != null && maxShare > 0 ? getShare(value) / maxShare : undefined;

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
