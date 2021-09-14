import React from "react";
import PropTypes from "prop-types";
import { Group } from "@visx/group";
import { Pie } from "@visx/shape";

const propTypes = {
  data: PropTypes.array,
  colors: PropTypes.object,
  accessors: PropTypes.shape({
    dimension: PropTypes.func,
    metric: PropTypes.func,
  }),
};

const layout = {
  width: 540,
  height: 540,
  margin: 20,
  thickness: 100,
  cornerRadius: 2,
  padAngle: 0.02,
};

const CategoricalDonutChart = ({ data, colors, accessors }) => {
  const innerWidth = layout.width - layout.margin * 2;
  const innerHeight = layout.height - layout.margin * 2;
  const outerRadius = Math.min(innerWidth, innerHeight) / 2;
  const innerRadius = outerRadius - layout.thickness;
  const centerX = layout.margin + innerWidth / 2;
  const centerY = layout.margin + innerHeight / 2;
  const pieSortValues = (a, b) => b - a;

  return (
    <svg width={layout.width} height={layout.height}>
      <Group top={centerY} left={centerX}>
        <Pie
          data={data}
          pieValue={accessors.metric}
          pieSortValues={pieSortValues}
          outerRadius={outerRadius}
          innerRadius={innerRadius}
          cornerRadius={layout.cornerRadius}
          padAngle={layout.padAngle}
        >
          {pie =>
            pie.arcs.map((arc, index) => {
              const path = pie.path(arc);
              const dimension = arc.data[0];
              const fill = colors[dimension];

              return (
                <g key={`arc-${index}`}>
                  <path d={path} fill={fill} />
                </g>
              );
            })
          }
        </Pie>
      </Group>
    </svg>
  );
};

CategoricalDonutChart.propTypes = propTypes;

export default CategoricalDonutChart;
