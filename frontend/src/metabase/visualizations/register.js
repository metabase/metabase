import {
  registerVisualization,
  setDefaultVisualization,
} from "metabase/visualizations";

import ActionViz from "metabase/actions/components/ActionViz";

import { Scalar } from "./visualizations/Scalar";
import { SmartScalar } from "./visualizations/SmartScalar";
import Progress from "./visualizations/Progress";
import Table from "./visualizations/Table";
import { Text } from "./visualizations/Text";
import { LinkViz } from "./visualizations/LinkViz";
import LineChart from "./visualizations/LineChart";
import BarChart from "./visualizations/BarChart";
import WaterfallChart from "./visualizations/WaterfallChart";
import RowChart from "./visualizations/RowChart";
import PieChart from "./visualizations/PieChart";
import { PieChart as EChartsPie } from "./echarts/visualizations";
import { ComboChart as EChartsComboChart } from "./echarts/visualizations/ComboChart";
import AreaChart from "./visualizations/AreaChart";
import ComboChart from "./visualizations/ComboChart";
import MapViz from "./visualizations/Map";
import ScatterPlot from "./visualizations/ScatterPlot";
import Funnel from "./visualizations/Funnel";
import Gauge from "./visualizations/Gauge";
import ObjectDetail from "./visualizations/ObjectDetail";
import PivotTable from "./visualizations/PivotTable";
import { Heading } from "./visualizations/Heading";

export default function () {
  registerVisualization(Scalar);
  registerVisualization(SmartScalar);
  registerVisualization(Progress);
  registerVisualization(Gauge);
  registerVisualization(Table);
  registerVisualization(Text);
  registerVisualization(LinkViz);
  registerVisualization(LineChart);
  registerVisualization(AreaChart);
  registerVisualization(BarChart);
  registerVisualization(WaterfallChart);
  registerVisualization(ComboChart);
  registerVisualization(EChartsComboChart);
  registerVisualization(RowChart);
  registerVisualization(ScatterPlot);
  registerVisualization(PieChart);
  registerVisualization(EChartsPie);
  registerVisualization(MapViz);
  registerVisualization(Funnel);
  registerVisualization(ObjectDetail);
  registerVisualization(PivotTable);
  registerVisualization(ActionViz);
  registerVisualization(Heading);
  setDefaultVisualization(Table);
}
