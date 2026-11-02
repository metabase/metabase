import * as d3 from "d3";
import type { FeatureCollection, Geometry } from "geojson";
import { useMemo } from "react";

import usStatesGeoJson from "assets/geojson/us-states.json";

import S from "./UsStatesMap.module.css";

type StateProperties = { STATE: string; NAME: string };

// Prototype: the map is in the bundle, not loaded at runtime like the
// region map visualization does.
const STATES = usStatesGeoJson as FeatureCollection<Geometry, StateProperties>;

const WIDTH = 352;

interface UsStatesMapProps {
  /** Values that the column has, by upper-case state code. */
  valuesByCode: Map<string, string>;
  selectedValues: string[];
  onToggle: (value: string) => void;
}

export function UsStatesMap({
  valuesByCode,
  selectedValues,
  onToggle,
}: UsStatesMapProps) {
  const { paths, height } = useMemo(() => {
    const projection = d3.geoAlbersUsa().fitWidth(WIDTH, STATES);
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
  }, []);

  const selectedValuesSet = new Set(selectedValues);

  return (
    <svg className={S.map} viewBox={`0 0 ${WIDTH} ${height}`} role="group">
      {paths.map(({ code, name, d }) => {
        const value = valuesByCode.get(code);
        return (
          <path
            key={code}
            className={S.state}
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
