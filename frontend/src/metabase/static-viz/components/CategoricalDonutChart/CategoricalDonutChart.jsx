import { Group } from "@visx/group";
import { Pie } from "@visx/shape";
import { Text } from "@visx/text";
import PropTypes from "prop-types";
import { t } from "ttag";

import { getTextColorForBackground } from "metabase/lib/colors";

import { DIMENSION_ACCESSORS } from "../../constants/accessors";
import { formatNumber, formatPercent } from "../../lib/numbers";

const propTypes = {
  data: PropTypes.array,
  colors: PropTypes.object,
  accessors: PropTypes.shape({
    dimension: PropTypes.func,
    metric: PropTypes.func,
  }),
  settings: PropTypes.shape({
    metric: PropTypes.object,
    percent_visibility: PropTypes.oneOf(["off", "legend", "inside"]),
    show_total: PropTypes.bool,
  }),
};

const layout = {
  width: 540,
  height: 540,
  margin: 20,
  font: {
    family: "Lato, sans-serif",
    weight: 700,
  },
  colors: {
    textLight: "#b8bbc3",
    textDark: "#4c5773",
  },
  thickness: 100,
  cornerRadius: 2,
  padAngle: 0.02,
  valueFontSize: 22,
  labelFontSize: 14,
  arcLabelFontSize: 18,
};

const CategoricalDonutChart = ({
  data,
  colors,
  accessors = DIMENSION_ACCESSORS,
  settings,
}) => {
  const innerWidth = layout.width - layout.margin * 2;
  const innerHeight = layout.height - layout.margin * 2;
  const outerRadius = Math.min(innerWidth, innerHeight) / 2;
  const innerRadius = outerRadius - layout.thickness;
  const centerX = layout.margin + innerWidth / 2;
  const centerY = layout.margin + innerHeight / 2;
  const pieSortValues = (a, b) => b - a;
  const textHeight = layout.valueFontSize + layout.labelFontSize;
  const textCenter = textHeight / 3;
  const totalValue = data.map(accessors.metric).reduce((a, b) => a + b, 0);
  const totalLabel = t`Total`.toUpperCase();

  const shouldShowLabels = settings?.percent_visibility === "inside";
  const shouldShowTotal = settings?.show_total ?? true;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={layout.width}
      height={layout.height}
    >
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

              const hasSpaceForLabel = arc.endAngle - arc.startAngle >= 0.32;
              const [centroidX, centroidY] = pie.path.centroid(arc);
              const percent = arc.value / totalValue;
              const labelColor = getTextColorForBackground(fill);

              return (
                <g key={`arc-${index}`}>
                  <path d={path} fill={fill} />
                  {shouldShowLabels && hasSpaceForLabel && (
                    <text
                      fontFamily={layout.font.family}
                      x={centroidX}
                      y={centroidY}
                      dy=".33em"
                      fill={labelColor}
                      fontSize={layout.arcLabelFontSize}
                      textAnchor="middle"
                    >
                      {formatPercent(percent)}
                    </text>
                  )}
                </g>
              );
            })
          }
        </Pie>
        {shouldShowTotal && (
          <Group
            fontFamily={layout.font.family}
            fontWeight={layout.font.weight}
          >
            <Text
              y={-textCenter}
              fill={layout.colors.textDark}
              fontSize={layout.valueFontSize}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {formatNumber(totalValue, settings?.metric)}
            </Text>
            <Text
              y={textCenter}
              fill={layout.colors.textLight}
              fontSize={layout.labelFontSize}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {totalLabel}
            </Text>
          </Group>
        )}
      </Group>
    </svg>
  );
};

CategoricalDonutChart.propTypes = propTypes;

export default CategoricalDonutChart;
