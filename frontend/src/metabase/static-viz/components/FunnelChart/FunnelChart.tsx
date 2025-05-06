import { Group } from "@visx/group";
import { Line, Polygon } from "@visx/shape";
import { Fragment } from "react";

import type {
  FunnelDatum,
  FunnelSettings,
} from "metabase/static-viz/components/FunnelChart/types";
import {
  calculateFunnelPolygonPoints,
  calculateFunnelSteps,
  calculateStepOpacity,
  getFormattedStep,
  groupData,
  reorderData,
} from "metabase/static-viz/components/FunnelChart/utils/funnel";
import { Text } from "metabase/static-viz/components/Text";
import { measureTextHeight } from "metabase/static-viz/lib/text";

import Watermark from "../../watermark.svg?component";

import { calculateMargin } from "./utils/margin";

const layout = {
  width: 540,
  height: 300,
  stepFontSize: 12,
  measureFontSize: 11,
  percentFontSize: 16,
  initialMeasureFontSize: 24,
  nameFontSize: 16,
  stepTextOffset: 8,
  colors: {
    // eslint-disable-next-line no-color-literals
    textMedium: "#949aab",
    // eslint-disable-next-line no-color-literals
    brand: "#509ee3",
    // eslint-disable-next-line no-color-literals
    border: "#f0f0f0",
  },
  paddingLeft: 10,
  stepTopOffset: 10,
  measureBottomOffset: 8,
  percentBottomOffset: 24,
};

export type FunnelProps = {
  data: FunnelDatum[];
  settings: FunnelSettings;
  hasDevWatermark?: boolean;
};

const Funnel = ({ data, settings, hasDevWatermark = false }: FunnelProps) => {
  const palette = { ...layout.colors, ...settings.colors };

  const groupedData = groupData(data);
  const reorderedData = reorderData(groupedData, settings);

  const margin = calculateMargin(
    reorderedData[0],
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
  const stepWidth = (layout.width - margin.left) / (groupedData.length - 1);
  const maxStepTextWidth = stepWidth - layout.stepTextOffset * 2;

  const steps = calculateFunnelSteps(reorderedData, stepWidth, funnelHeight);

  const firstMeasureTop = margin.top + steps[0].top + steps[0].height / 2;
  const stepLabelTop = firstMeasureTop + measureTextHeight(layout.nameFontSize);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={layout.width}
      height={layout.height}
    >
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
                  fill={palette.brand}
                  points={points}
                  opacity={calculateStepOpacity(index, steps.length)}
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
                      y={firstMeasureTop}
                      fontSize={layout.initialMeasureFontSize}
                      fill="black"
                      style={{ fontWeight: 700 }}
                    >
                      {measure}
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
            </Fragment>
          );
        })}
      </Group>
      {hasDevWatermark && (
        <Watermark
          x="0"
          y="0"
          height={layout.height}
          width={layout.width}
          preserveAspectRatio="xMinYMin slice"
        />
      )}
    </svg>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Funnel;
