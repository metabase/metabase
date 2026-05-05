import {
  BarChart,
  BoxplotChart,
  CustomChart,
  LineChart,
  SankeyChart,
  ScatterChart,
  SunburstChart,
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
import { use } from "echarts/core";
import { LabelLayout } from "echarts/features";
import { SVGRenderer } from "echarts/renderers";

export const registerEChartsModules = () => {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  use([
    LineChart,
    BarChart,
    BoxplotChart,
    ScatterChart,
    CustomChart,
    SunburstChart,
    GraphicComponent,
    GridComponent,
    BarChart,
    SVGRenderer,
    MarkLineComponent,
    DataZoomComponent,
    ToolboxComponent,
    BrushComponent,
    DatasetComponent,
    SankeyChart,
    LabelLayout,
    TooltipComponent,
  ]);
};
