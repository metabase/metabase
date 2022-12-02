import React, { Fragment } from "react";
import { Line, Polygon } from "@visx/shape";
import { Group } from "@visx/group";
import { Text } from "metabase/static-viz/components/Text";
import { measureTextHeight } from "metabase/static-viz/lib/text";
import { FunnelSettings } from "metabase/static-viz/components/FunnelChart/types";
import {
  calculateFunnelPolygonPoints,
  calculateFunnelSteps,
  calculateStepOpacity,
  getFormattedStep,
} from "metabase/static-viz/components/FunnelChart/utils/funnel";
import { ColorGetter } from "metabase/static-viz/lib/colors";
import { calculateMargin } from "./utils/margin";
import { FunnelDatum } from "./utils/data";

const layout = {
  width: 540,
  height: 300,
  stepFontSize: 12,
  measureFontSize: 11,
  percentFontSize: 16,
  initialMeasureFontSize: 24,
  nameFontSize: 16,
  stepTextOffset: 8,
  paddingLeft: 10,
  stepTopOffset: 10,
  measureBottomOffset: 8,
  percentBottomOffset: 24,
};

type FunnelChartViewProps = {
  data: FunnelDatum[];
  settings: FunnelSettings;
  getColor: ColorGetter;
};

export const FunnelChartView = ({
  data,
  settings,
  getColor,
}: FunnelChartViewProps) => {
  const margin = calculateMargin(
    data[0],
    layout.stepFontSize,
    layout.percentFontSize,
    layout.measureFontSize,
    layout.initialMeasureFontSize,
    layout.nameFontSize,
    layout.measureBottomOffset,
    layout.paddingLeft,
    settings,
  );

  const funnelHeight = layout.height - margin.top - margin.bottom;
  const stepWidth = (layout.width - margin.left) / (data.length - 1);
  const maxStepTextWidth = stepWidth - layout.stepTextOffset * 2;

  const steps = calculateFunnelSteps(data, stepWidth, funnelHeight);

  const firstMeasureTop = margin.top + steps[0].top + steps[0].height / 2;
  const stepLabelTop = firstMeasureTop + measureTextHeight(layout.nameFontSize);

  return (
    <svg width={layout.width} height={layout.height}>
      <Group left={margin.left}>
        {steps.map((step, index) => {
          const isFirst = index === 0;
          const isLast = index === steps.length - 1;
          const nextStep = steps[index + 1];

          const points = isLast
            ? null
            : calculateFunnelPolygonPoints(step, nextStep, margin.top);

          const { stepName, measure, percent } = getFormattedStep(
            step,
            maxStepTextWidth,
            layout.stepFontSize,
            layout.measureFontSize,
            layout.percentFontSize,
            settings,
            isFirst,
          );

          return (
            <Fragment key={index}>
              {points && (
                <Polygon
                  fill={getColor("brand")}
                  points={points}
                  opacity={calculateStepOpacity(index, steps.length)}
                />
              )}
              <Line
                x1={step.left}
                y1={0}
                x2={step.left}
                y2={layout.height}
                stroke={getColor("border")}
              />

              <Group left={step.left - layout.stepTextOffset}>
                <Text
                  textAnchor="end"
                  y={layout.stepTopOffset}
                  fontSize={layout.stepFontSize}
                  fill={getColor("textMedium")}
                >
                  {stepName}
                </Text>

                {isFirst && (
                  <>
                    <Text
                      textAnchor="end"
                      y={firstMeasureTop}
                      fontSize={layout.initialMeasureFontSize}
                      fill="black"
                      style={{ fontWeight: 700 }}
                    >
                      {measure}
                    </Text>

                    <Text
                      textAnchor="end"
                      fill={getColor("textMedium")}
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
                      fill={getColor("textMedium")}
                      y={layout.height - layout.percentBottomOffset}
                      fontSize={layout.percentFontSize}
                    >
                      {percent}
                    </Text>

                    <Text
                      textAnchor="end"
                      fill={getColor("textMedium")}
                      y={layout.height - layout.measureBottomOffset}
                      fontSize={layout.measureFontSize}
                    >
                      {measure}
                    </Text>
                  </>
                )}
              </Group>
            </Fragment>
          );
        })}
      </Group>
    </svg>
  );
};
