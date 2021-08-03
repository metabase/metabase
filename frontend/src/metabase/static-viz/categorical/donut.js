/* eslint-disable react/prop-types */
import React from "react";
import { Pie } from "@visx/shape";
import { scaleOrdinal } from "@visx/scale";
import { Group } from "@visx/group";

export default function Donut({ data, colors, accessors }, layout) {
  const scale = scaleOrdinal({
    domain: data.map(accessors.dimension),
    range: Object.keys(colors).map(c => ({ name: c, fill: colors[c] })),
  });

  const innerWidth = layout.width - layout.margin.left - layout.margin.right;
  const innerHeight = layout.height - layout.margin.top - layout.margin.bottom;
  const radius = Math.min(innerWidth, innerHeight) / 2;
  const centerY = innerHeight / 2;
  const centerX = innerWidth / 2;

  const donutThickness = 100;

  const top = centerY + layout.margin.top;
  const left = centerX + layout.margin.left;

  const pieSortValues = (a, b) => b - a;

  return (
    <svg width={layout.width} height={layout.height}>
      <Group top={top} left={left}>
        <Pie
          data={data}
          pieValue={accessors.metric}
          pieSortValues={pieSortValues}
          outerRadius={radius}
          innerRadius={radius - donutThickness}
          cornerRadius={2}
          padAngle={0.02}
        >
          {pie => {
            return pie.arcs.map((arc, index) => {
              const arcPath = pie.path(arc);
              const dimension = arc.data[0];
              const fill = scale.range().filter(r => r.name === dimension)[0]
                .fill;
              return (
                <g key={`arc-${index}`}>
                  <path d={arcPath} fill={fill} />
                </g>
              );
            });
          }}
        </Pie>
      </Group>
    </svg>
  );
}
