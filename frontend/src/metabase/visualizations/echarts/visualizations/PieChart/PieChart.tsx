import { useMemo, useState } from "react";
import type { VisualizationProps } from "metabase/visualizations/types";

import { buildPieChart } from "metabase/visualizations/shared/echarts/pie";
import { measureTextWidth } from "metabase/lib/measure-text";
import { formatValue } from "metabase/lib/formatting/value";
import { color } from "metabase/lib/colors";
import { PIE_CHART_SETTINGS } from "metabase/visualizations/echarts/visualizations/PieChart/settings";
import { computeStaticPieChartSettings } from "metabase/static-viz/components/PieChart/settings";
import { EChartsRenderer } from "../../EChartsRenderer";
import { PieChartLegend } from "./PieChartLegend";
import { useChartDimension } from "./utils";

Object.assign(PieChart, {
  uiName: "Pie 2",
  identifier: "pie2",
  iconName: "pie",
  settings: PIE_CHART_SETTINGS,
});

export function PieChart(props: VisualizationProps) {
  const [hideSeries, setHideSeries] = useState(false);

  const { option, legend, eventHandlers, zrEventHandlers } = buildPieChart(
    hideSeries ? [] : props.rawSeries,
    computeStaticPieChartSettings(props.rawSeries),
    {
      getColor: color,
      measureText: measureTextWidth,
      formatValue: formatValue,
    },
    props,
  );
  console.log("option", option);

  const { sideLength, onChartDimensionChange } = useChartDimension();

  return (
    <>
      <PieChartLegend
        legend={legend}
        onChartDimensionChange={onChartDimensionChange}
        {...props}
      >
        <EChartsRenderer
          config={{
            option,
            eventHandlers,
            zrEventHandlers,
          }}
          width={sideLength}
          height={sideLength}
        />
      </PieChartLegend>
      <button onClick={() => setHideSeries(!hideSeries)}>
        Toggle Series: Currently {hideSeries ? "hidden" : "shown"}
      </button>
    </>
  );
}
