import React from "react";
import { Line, Polygon } from "@visx/shape";
import { Group } from "@visx/group";
import { Text } from "metabase/static-viz/components/Text";
import {
  measureText,
  measureTextHeight,
  truncateText,
} from "metabase/static-viz/lib/text";
import {
  FunnelDatum,
  FunnelSettings,
} from "metabase/static-viz/components/Funnel/types";
import {
  calculateFunnelPolygonPoints,
  calculateFunnelSteps,
  calculateStepOpacity,
  formatPercent,
} from "metabase/static-viz/components/Funnel/utils";

const layout = {
  width: 540,
  height: 300,
  stepFontSize: 14,
  measureFontSize: 11,
  percentFontSize: 16,
  initialMeasureFontSize: 24,
  nameFontSize: 16,
  stepTextOffset: 8,
  colors: {
    textMedium: "#949aab",
    brand: "#509ee3",
    border: "#f0f0f0",
  },
  paddingLeft: 10,
  stepTopOffset: 10,
  measureBottomOffset: 8,
  percentBottomOffset: 24,
};

const firstMeasureCharWidth = 15;
const percentCharWidth = 7;
const stepNameCharWidth = 8;

type FunnelProps = {
  data: FunnelDatum[];
  settings: FunnelSettings;
};

const Funnel = ({ data, settings }: FunnelProps) => {
  const palette = { ...layout.colors, ...settings.colors };
  const [firstStep, firstMeasure] = data[0];

  const marginTop = measureTextHeight(layout.stepFontSize);
  const marginBottom =
    measureTextHeight(layout.percentFontSize) +
    measureTextHeight(layout.measureFontSize) +
    layout.measureBottomOffset;
  const marginLeft =
    Math.max(
      measureText(firstStep.toString()),
      measureText(firstMeasure.toString(), firstMeasureCharWidth),
      measureText(settings.step.name, stepNameCharWidth),
    ) + layout.paddingLeft;

  const funnelHeight = layout.height - marginTop - marginBottom;
  const stepWidth = (layout.width - marginLeft) / (data.length - 1);
  const maxStepTextWidth = stepWidth - layout.stepTextOffset * 2.5;

  const steps = calculateFunnelSteps(data, stepWidth, funnelHeight);

  const firstMeasureTop = marginTop + steps[0].top + steps[0].height / 2;
  const stepLabelTop = firstMeasureTop + measureTextHeight(layout.nameFontSize);

  return (
    <svg width={layout.width} height={layout.height}>
      <Group left={marginLeft}>
        {steps.map((step, index) => {
          const isFirst = index === 0;
          const isLast = index === steps.length - 1;
          const nextStep = steps[index + 1];

          const points = isLast
            ? null
            : calculateFunnelPolygonPoints(step, nextStep, marginTop);
          const opacity = calculateStepOpacity(index, steps.length);

          const stepName = truncateText(step.step, maxStepTextWidth);
          const measure = truncateText(
            step.measure.toString(),
            maxStepTextWidth,
          );
          const percent = truncateText(
            formatPercent(step.percent),
            maxStepTextWidth,
            percentCharWidth,
          );

          return (
            <>
              {points && (
                <Polygon
                  key={index}
                  fill={palette.brand}
                  points={points}
                  opacity={opacity}
                />
              )}
              <Line
                x1={step.left}
                y1={0}
                x2={step.left}
                y2={layout.height}
                stroke={palette.border}
              />

              <Group left={step.left - layout.stepTextOffset}>
                <Text
                  textAnchor="end"
                  y={layout.stepTopOffset}
                  fontSize={layout.stepFontSize}
                  fill={palette.textMedium}
                >
                  {stepName}
                </Text>

                {isFirst && (
                  <>
                    <Text
                      textAnchor="end"
                      fontWeight={700}
                      y={firstMeasureTop}
                      fontSize={layout.initialMeasureFontSize}
                      fill="black"
                    >
                      {step.measure}
                    </Text>

                    <Text
                      textAnchor="end"
                      fill={palette.textMedium}
                      y={stepLabelTop}
                      fontSize={layout.nameFontSize}
                    >
                      {settings.step.name}
                    </Text>
                  </>
                )}

                {!isFirst && (
                  <>
                    <Text
                      textAnchor="end"
                      fill={palette.textMedium}
                      y={layout.height - layout.percentBottomOffset}
                      fontSize={layout.percentFontSize}
                    >
                      {percent}
                    </Text>

                    <Text
                      textAnchor="end"
                      fill={palette.textMedium}
                      y={layout.height - layout.measureBottomOffset}
                      fontSize={layout.measureFontSize}
                    >
                      {measure}
                    </Text>
                  </>
                )}
              </Group>
            </>
          );
        })}
      </Group>
    </svg>
  );
};

export default Funnel;
