import {
  LineChart,
  BarChart,
  ScatterChart,
  SunburstChart,
  CustomChart,
} from "echarts/charts";
import {
  BrushComponent,
  DataZoomComponent,
  GridComponent,
  MarkLineComponent,
  ToolboxComponent,
  DatasetComponent,
  GraphicComponent,
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
  ]);
};
