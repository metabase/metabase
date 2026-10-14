import type { EChartsType } from "echarts/core";
import { useEffect, useState } from "react";
import _ from "underscore";

import { Box } from "metabase/ui";
import { GoalWarningIcon } from "metabase/visualizations/components/GoalWarning";
import {
  CHART_STYLE,
  type ComputedVisualizationSettings,
  GOAL_WARNING_GAP,
  GOAL_WARNING_ICON_SIZE,
  type GoalLineLabelLayout,
  type GoalLineParams,
  type GoalRefError,
  type RenderingContext,
  getGoalLineLabelLayout,
  getGoalLineValue,
} from "metabase/viz-core";

type GoalLineWarningsProps = {
  chartInstance: EChartsType | undefined;
  errors: GoalRefError[];
  goalLineParams: Pick<
    GoalLineParams,
    "isNormalized" | "labelAlign" | "toEChartsAxisValue"
  >;
  plotLeft: number;
  plotRight: number;
  renderingContext: RenderingContext;
  settings: ComputedVisualizationSettings;
  // split panels draw a goal line in each panel, on its own y-axis
  yAxisCount: number;
};

export function GoalLineWarnings({
  chartInstance,
  errors,
  goalLineParams,
  plotLeft,
  plotRight,
  renderingContext,
  settings,
  yAxisCount,
}: GoalLineWarningsProps) {
  const [labelLayouts, setLabelLayouts] = useState<GoalLineLabelLayout[]>([]);
  const { isNormalized, labelAlign, toEChartsAxisValue } = goalLineParams;
  const { fontSize } = renderingContext.theme.cartesian.goalLine.label;
  const label = settings["graph.goal_label"] ?? "";
  const labelWidth = renderingContext.measureText(label, {
    size: fontSize,
    family: renderingContext.fontFamily,
    weight: CHART_STYLE.goalLine.label.weight,
  });

  useEffect(() => {
    function updateLabelLayouts() {
      const goalValue = getGoalLineValue(settings, isNormalized);
      const axisValue =
        goalValue != null ? toEChartsAxisValue(goalValue) : null;

      const next =
        chartInstance == null || axisValue == null
          ? []
          : _.range(yAxisCount).map((yAxisIndex) =>
              getGoalLineLabelLayout({
                goalY: chartInstance.convertToPixel({ yAxisIndex }, axisValue),
                plotLeft,
                plotRight,
                labelAlign,
                fontSize,
              }),
            );

      setLabelLayouts((previous) =>
        _.isEqual(previous, next) ? previous : next,
      );
    }

    updateLabelLayouts();
    chartInstance?.on("finished", updateLabelLayouts);

    return () => {
      chartInstance?.off("finished", updateLabelLayouts);
    };
  }, [
    chartInstance,
    fontSize,
    isNormalized,
    labelAlign,
    plotLeft,
    plotRight,
    settings,
    toEChartsAxisValue,
    yAxisCount,
  ]);

  return (
    <>
      {labelLayouts.map(({ x, y }, index) => (
        <Box
          key={index}
          pos="absolute"
          left={
            labelAlign === "right"
              ? x - labelWidth - GOAL_WARNING_GAP - GOAL_WARNING_ICON_SIZE
              : x + labelWidth + GOAL_WARNING_GAP
          }
          top={y + (fontSize - GOAL_WARNING_ICON_SIZE) / 2}
        >
          <GoalWarningIcon errors={errors} source="goal" />
        </Box>
      ))}
    </>
  );
}
