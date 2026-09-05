import {
  BarChart,
  BoxplotChart,
  CustomChart,
  LineChart,
  SankeyChart,
  ScatterChart,
  SunburstChart,
  TreemapChart,
} from "echarts/charts";
import {
  BrushComponent,
  DataZoomComponent,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  MarkLineComponent,
  ToolboxComponent,
  TooltipComponent,
} from "echarts/components";
import { use as echartsUse, graphic, init, setPlatformAPI } from "echarts/core";
import { LabelLayout } from "echarts/features";
import { SVGRenderer } from "echarts/renderers";

export type { EChartsOption } from "echarts";
export type { EChartsCoreOption, EChartsType } from "echarts/core";
export type { TooltipOption } from "echarts/types/dist/shared";

echartsUse([
  LineChart,
  BarChart,
  BoxplotChart,
  ScatterChart,
  CustomChart,
  SunburstChart,
  GraphicComponent,
  GridComponent,
  SVGRenderer,
  MarkLineComponent,
  DataZoomComponent,
  ToolboxComponent,
  BrushComponent,
  DatasetComponent,
  SankeyChart,
  TreemapChart,
  LabelLayout,
  TooltipComponent,
]);

export { graphic, init, setPlatformAPI };
