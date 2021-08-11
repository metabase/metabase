/* eslint-disable react/prop-types */
import React from "react";
import { scaleOrdinal } from "@visx/scale";
import { AlbersUsa } from "@visx/geo";
import * as topojson from "topojson-client";
import topology from "../lib/usa-topo.json";
import stateAbbrs from "../lib/us-abbr.json";

const { features: unitedStates } = topojson.feature(
  topology,
  topology.objects.states,
);

export default function USMap({ data }, layout) {
  const { width, height } = layout;
  const scale = (width + height) / 1.55;
  const color = scaleOrdinal({
    domain: [Math.min(data.map(d => d[1])), Math.max(data.map(d => d[1]))],
    range: ["#daecfb", "#aad1f4", "#7ab7ec", "#499ce5", "#1670c1"],
  });
  const centerX = width / 2;
  const centerY = height / 2;
  return (
    <svg width={layout.width} height={layout.height}>
      <AlbersUsa
        data={unitedStates}
        scale={scale}
        translate={[centerX, centerY - 25]}
      >
        {({ features }) =>
          features.map(({ feature, path, projection }, i) => {
            const abbr = stateAbbrs[feature.id];
            const value = data.filter(d => d[0] === abbr)[0];
            const fill = color(value && value[1]);
            return (
              <path
                key={`map-feature-${i}`}
                d={path || ""}
                fill={fill}
                stroke={"#fff"}
                strokeWidth={0.75}
              />
            );
          })
        }
      </AlbersUsa>
    </svg>
  );
}
