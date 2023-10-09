import { useMemo } from "react";
import type { VisualizationProps } from "metabase/visualizations/types";

import { measureTextWidth } from "metabase/lib/measure-text";
import { formatValue } from "metabase/lib/formatting/value";
import { color } from "metabase/lib/colors";
import { buildComboChart } from "metabase/visualizations/shared/echarts/combo/option";
import {
  GRAPH_AXIS_SETTINGS,
  GRAPH_COLORS_SETTINGS,
  GRAPH_DATA_SETTINGS,
  GRAPH_DISPLAY_VALUES_SETTINGS,
  GRAPH_TREND_SETTINGS,
  LINE_SETTINGS,
} from "metabase/visualizations/lib/settings/graph";
import { GRAPH_GOAL_SETTINGS } from "metabase/visualizations/lib/settings/goal";
import LineAreaBarChart from "metabase/visualizations/components/LineAreaBarChart";
import { EChartsRenderer } from "../../EChartsRenderer";

Object.assign(ComboChart, {
  uiName: "Combo EChart",
  identifier: "combo2",
  iconName: "bolt",
  supportsSeries: true,
  settings: {
    ...LINE_SETTINGS,
    ...GRAPH_GOAL_SETTINGS,
    ...GRAPH_TREND_SETTINGS,
    ...GRAPH_COLORS_SETTINGS,
    ...GRAPH_AXIS_SETTINGS,
    ...GRAPH_DISPLAY_VALUES_SETTINGS,
    ...GRAPH_DATA_SETTINGS,
  },
  transformSeries: LineAreaBarChart.transformSeries,
});

export function ComboChart(props: VisualizationProps) {
  const { option, eventHandlers } = useMemo(
    () =>
      buildComboChart(
        props.rawSeries,
        props.settings,
        {
          getColor: color,
          measureText: measureTextWidth,
          formatValue: formatValue,
        },
        props.onHoverChange,
        props.hovered,
        props.onVisualizationClick,
      ),
    [
      props.rawSeries,
      props.settings,
      props.onHoverChange,
      props.hovered?.index,
      props.onVisualizationClick,
    ],
  );

  if (props.width == null || props.height == null) {
    return null;
  }

  return (
    <EChartsRenderer
      config={{ option, eventHandlers, zrEventHandlers: [] }}
      width={props.width}
      height={props.height}
    />
  );
}
