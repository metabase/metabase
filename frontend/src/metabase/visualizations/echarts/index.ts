import {
  BarChart,
  CustomChart,
  LineChart,
  SankeyChart,
  ScatterChart,
  SunburstChart,
  TreemapChart,
} from "echarts/charts";
import {
  BrushComponent,
  CalendarComponent,
  DataZoomComponent,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  MarkLineComponent,
  ToolboxComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { use } from "echarts/core";
import { LabelLayout } from "echarts/features";
import { SVGRenderer } from "echarts/renderers";

export const registerEChartsModules = () => {
  use([
    LineChart,
    BarChart,
    ScatterChart,
    CustomChart,
    SunburstChart,
    TreemapChart,
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
    CalendarComponent,
    VisualMapComponent,
  ]);
};
