import { Group } from "@visx/group";
import { Pie } from "@visx/shape";
import type { PieArcDatum } from "@visx/shape/lib/shapes/Pie";

import type { ColorGetter } from "metabase/visualizations/types";

import GaugeLabel from "./GaugeLabel";
import GaugeNeedle from "./GaugeNeedle";
import {
  START_ANGLE,
  END_ANGLE,
  CHART_WIDTH,
  GAUGE_OUTER_RADIUS,
  GAUGE_INNER_RADIUS,
  SEGMENT_LABEL_FONT_SIZE,
  CHART_HEIGHT,
} from "./constants";
import type { GaugeLabelData, GaugeSegment, Position } from "./types";
import {
  limit,
  calculateChartScale,
  calculateValueFontSize,
  calculateRelativeValueAngle,
  getCirclePositionInSvgCoordinate,
  gaugeAccessor,
  gaugeSorter,
  colorGetter,
} from "./utils";

interface GaugeProps {
  value: number;
  valueFormatter: (value: number) => string;
  segments: GaugeSegment[];
  gaugeLabels: GaugeLabelData[];
  center: Position;
  getColor: ColorGetter;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function Gauge({
  value,
  valueFormatter,
  segments,
  gaugeLabels,
  center,
  getColor,
}: GaugeProps) {
  const segmentMinValue = segments[0].min;
  const segmentMaxValue = segments[segments.length - 1].max;
  const gaugeNeedleAngle = limit(
    START_ANGLE +
      calculateRelativeValueAngle(value, segmentMinValue, segmentMaxValue),
    START_ANGLE,
    END_ANGLE,
  );
  const gaugeNeedlePosition = getCirclePositionInSvgCoordinate(
    GAUGE_INNER_RADIUS,
    gaugeNeedleAngle,
  );

  const formattedValue = valueFormatter(value);
  const dynamicValueFontSize = calculateValueFontSize(
    formattedValue,
    GAUGE_INNER_RADIUS,
  );
  const outlineColor = getColor("white");

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={CHART_WIDTH}
      height={CHART_HEIGHT}
      fontFamily="Lato"
    >
      <g transform={`translate(${CHART_WIDTH / 2}, ${CHART_HEIGHT / 2})`}>
        {/* `transform-origin: center` doesn't work when rendered with Batik.
            This <g /> translates the center of the chart to coordinate (0,0),
            making `scale(number)` using the center of the chart as a transform
            origin similar to `transform-origin: center` */}
        <g
          transform={`scale(${calculateChartScale(gaugeLabels)})
                      translate(${-CHART_WIDTH / 2}, ${-CHART_HEIGHT / 2})`}
        >
          <Group top={center[1]} left={center[0]}>
            <Pie
              data={segments}
              outerRadius={GAUGE_OUTER_RADIUS}
              innerRadius={GAUGE_INNER_RADIUS}
              pieValue={gaugeAccessor}
              pieSort={gaugeSorter}
              startAngle={START_ANGLE}
              endAngle={END_ANGLE}
            >
              {pie => {
                // Renders similar to Pie's default children.
                // https://github.com/airbnb/visx/blob/978c143dae4057e482b0ca909e8c5a16c85dfd1e/packages/visx-shape/src/shapes/Pie.tsx#L86-L98
                const baseArcPath = pie.path({
                  startAngle: START_ANGLE,
                  endAngle: END_ANGLE,
                } as unknown as PieArcDatum<GaugeSegment>);
                return (
                  <Group className="visx-pie-arcs-group">
                    {baseArcPath && (
                      <g>
                        <path d={baseArcPath} fill={getColor("bg-medium")} />
                      </g>
                    )}
                    {pie.arcs.map((arc, index) => {
                      const arcPath = pie.path({
                        ...arc,
                        startAngle:
                          START_ANGLE +
                          calculateRelativeValueAngle(
                            arc.data.min,
                            segmentMinValue,
                            segmentMaxValue,
                          ),
                        endAngle:
                          START_ANGLE +
                          calculateRelativeValueAngle(
                            arc.data.max,
                            segmentMinValue,
                            segmentMaxValue,
                          ),
                      });
                      return (
                        arcPath && (
                          <g key={`pie-arc-${index}`}>
                            <path d={arcPath} fill={colorGetter(arc)} />
                          </g>
                        )
                      );
                    })}
                  </Group>
                );
              }}
            </Pie>
            <GaugeNeedle
              color={getColor("bg-dark")}
              outlineColor={outlineColor}
              position={gaugeNeedlePosition}
              valueAngle={gaugeNeedleAngle}
            />
            {gaugeLabels.map(
              ({ color, position, textAnchor, value }, index) => {
                return (
                  <GaugeLabel
                    key={index}
                    fill={color}
                    stroke={outlineColor}
                    fontSize={SEGMENT_LABEL_FONT_SIZE}
                    position={position}
                    label={value}
                    textAnchor={textAnchor}
                  />
                );
              },
            )}
            <GaugeLabel
              fill={getColor("text-dark")}
              stroke={outlineColor}
              fontSize={dynamicValueFontSize}
              position={[0, -GAUGE_INNER_RADIUS * 0.4]}
              label={formattedValue}
            />
          </Group>
        </g>
      </g>
    </svg>
  );
}
