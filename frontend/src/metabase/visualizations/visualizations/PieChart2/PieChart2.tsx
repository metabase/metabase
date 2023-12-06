import type { VisualizationProps } from "metabase/visualizations/types";
import { EChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";

Object.assign(PieChart2, {
  uiName: "Pie 2",
  identifier: "pie2",
  iconName: "pie",
});

// Only using this for testing, wiull
// remove from this branch before merging
export function PieChart2(props: VisualizationProps) {
  return (
    <EChartsRenderer
      option={{
        series: {
          type: "sunburst",
          data: [
            { name: "slice1", value: 20 },
            { name: "slice2", value: 30 },
          ],
        },
      }}
      width={props.width}
      height={props.height}
      eventHandlers={[]}
      zrEventHandlers={[]}
    />
  );
}
