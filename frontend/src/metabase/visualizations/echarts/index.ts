import {
  BarChart,
  CustomChart,
  TreemapChart,
  LineChart,
  ScatterChart,
  SunburstChart,
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
    LabelLayout,
    TooltipComponent,
    CalendarComponent,
    VisualMapComponent,
  ]);
};
