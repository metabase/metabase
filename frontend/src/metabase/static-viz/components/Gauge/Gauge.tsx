import React, { Fragment } from "react";

import { Pie } from "@visx/shape";
import { Group } from "@visx/group";
import type { PieArcDatum } from "@visx/shape/lib/shapes/Pie";

import { formatNumber } from "metabase/static-viz/lib/numbers";
import { truncateText } from "metabase/static-viz/lib/text";
import type { ColorGetter } from "metabase/static-viz/lib/colors";

import {
  START_ANGLE,
  END_ANGLE,
  CHART_WIDTH,
  GAUGE_OUTER_RADIUS,
  CHART_VERTICAL_MARGIN,
  GAUGE_INNER_RADIUS,
  SEGMENT_LABEL_MARGIN,
  DISTANCE_TO_MIDDLE_LABEL_ANCHOR,
  MAX_SEGMENT_VALUE_WIDTH,
  SEGMENT_LABEL_FONT_SIZE,
  CHART_HEIGHT,
} from "./constants";
import {
  limit,
  removeDuplicateElements,
  calculateChartScale,
  calculateValueFontSize,
  calculateRelativeValueAngle,
  calculateSegmentLabelPosition,
  calculateSegmentLabelTextAnchor,
  getCirclePositionInSvgCoordinate,
  gaugeAccessor,
  gaugeSorter,
  colorGetter,
} from "./utils";

import GaugeNeedle from "./GaugeNeedle";
import GaugeLabel from "./GaugeLabel";

import type { Card, Data, GaugeLabelData, GaugeSegment } from "./types";

interface GaugeProps {
  card: Card;
  data: Data;
  getColor: ColorGetter;
}

export default function Gauge({ card, data, getColor }: GaugeProps) {
  const settings = card.visualization_settings;
  const segmentData = settings["gauge.segments"];

  const gaugeCenterX = CHART_WIDTH / 2;
  const gaugeCenterY = GAUGE_OUTER_RADIUS + CHART_VERTICAL_MARGIN;

  const segmentMinValue = segmentData[0].min;
  const segmentMaxValue = segmentData[segmentData.length - 1].max;

  const value = data.rows[0][0];
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

  const formattedValue = formatNumber(value);
  const dynamicValueFontSize = calculateValueFontSize(
    formattedValue,
    GAUGE_INNER_RADIUS,
  );

  const segmentMinMaxLabels: GaugeLabelData[] = segmentData
    .flatMap(segmentDatum => {
      return [segmentDatum.min, segmentDatum.max];
    })
    // gauge segments could be continuous i.e. the current max and the next min is the same value.
    // So we should remove duplicate elements.
    .reduce(removeDuplicateElements, [])
    .map((segmentValue, index, segmentValues): GaugeLabelData => {
      const isMinSegmentValue = index === 0;
      const isMaxSegmentValue = index === segmentValues.length - 1;
      const segmentValueAngle =
        START_ANGLE +
        calculateRelativeValueAngle(
          segmentValue,
          segmentMinValue,
          segmentMaxValue,
        );

      if (isMinSegmentValue) {
        return {
          position: [
            -(GAUGE_INNER_RADIUS + GAUGE_OUTER_RADIUS) / 2,
            SEGMENT_LABEL_MARGIN + DISTANCE_TO_MIDDLE_LABEL_ANCHOR,
          ],
          color: getColor("text-medium"),
          textAnchor: "middle",
          value: formatNumber(segmentValue),
        };
      }

      if (isMaxSegmentValue) {
        return {
          position: [
            (GAUGE_INNER_RADIUS + GAUGE_OUTER_RADIUS) / 2,
            SEGMENT_LABEL_MARGIN + DISTANCE_TO_MIDDLE_LABEL_ANCHOR,
          ],
          color: getColor("text-medium"),
          textAnchor: "middle",
          value: formatNumber(segmentValue),
        };
      }

      return {
        position: calculateSegmentLabelPosition(segmentValueAngle),
        color: getColor("text-medium"),
        textAnchor: calculateSegmentLabelTextAnchor(segmentValueAngle),
        value: formatNumber(segmentValue),
      };
    });

  const segmentLabels: GaugeLabelData[] = segmentData
    .filter(segment => segment.label)
    .map((segment): GaugeLabelData => {
      const angle =
        START_ANGLE +
        calculateRelativeValueAngle(
          (segment.max + segment.min) / 2,
          segmentMinValue,
          segmentMaxValue,
        );

      return {
        color: getColor("text-dark"),
        position: calculateSegmentLabelPosition(angle),
        textAnchor: calculateSegmentLabelTextAnchor(angle),
        value: truncateText(
          segment.label,
          MAX_SEGMENT_VALUE_WIDTH,
          SEGMENT_LABEL_FONT_SIZE,
        ),
      };
    });

  const gaugeLabels = segmentMinMaxLabels.concat(segmentLabels);
  const outlineColor = getColor("white");

  return (
    <svg width={CHART_WIDTH} height={CHART_HEIGHT}>
      <g transform={`translate(${CHART_WIDTH / 2}, ${CHART_HEIGHT / 2})`}>
        {/* `transform-origin: center` doesn't work when rendered with Batik.
            This <g /> translates the center of the chart to coordinate (0,0),
            making `scale(number)` using the center of the chart as a transform
            origin similar to `transform-origin: center` */}
        <g
          transform={`scale(${calculateChartScale(gaugeLabels)})
                      translate(${-CHART_WIDTH / 2}, ${-CHART_HEIGHT / 2})`}
        >
          <Group top={gaugeCenterY} left={gaugeCenterX}>
            <Pie
              data={segmentData}
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
                return (
                  <Group className="visx-pie-arcs-group">
                    <g key={`pie-arc-base`}>
                      <path
                        className="visx-pie-arc"
                        d={
                          pie.path({
                            startAngle: START_ANGLE,
                            endAngle: END_ANGLE,
                          } as unknown as PieArcDatum<GaugeSegment>) || ""
                        }
                        fill={getColor("bg-medium")}
                      />
                    </g>
                    {pie.arcs.map((arc, index) => {
                      return (
                        <g key={`pie-arc-${index}`}>
                          <path
                            className="visx-pie-arc"
                            d={
                              pie.path({
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
                              }) || ""
                            }
                            fill={colorGetter(arc)}
                          />
                        </g>
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
