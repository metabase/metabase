import ActionViz from "metabase/actions/components/ActionViz";
import { ListViz } from "metabase/list-view/components/ListViz";
import {
  registerVisualization,
  setDefaultVisualization,
} from "metabase/visualizations";

import { AreaChart } from "./visualizations/AreaChart";
import { BarChart } from "./visualizations/BarChart";
import { ComboChart } from "./visualizations/ComboChart";
import { DashCardPlaceholder } from "./visualizations/DashCardPlaceholder";
import { Funnel } from "./visualizations/Funnel";
import { Gauge } from "./visualizations/Gauge";
import { Heading } from "./visualizations/Heading";
import { IFrameViz } from "./visualizations/IFrameViz";
import { LineChart } from "./visualizations/LineChart";
import { LinkViz } from "./visualizations/LinkViz";
import { Map } from "./visualizations/Map";
import { ObjectDetail } from "./visualizations/ObjectDetail";
import { PieChart } from "./visualizations/PieChart";
import { PivotTable } from "./visualizations/PivotTable";
import { Progress } from "./visualizations/Progress";
import { RowChart } from "./visualizations/RowChart";
import { SankeyChart } from "./visualizations/SankeyChart";
import { Scalar } from "./visualizations/Scalar";
import { ScatterPlot } from "./visualizations/ScatterPlot";
import { SmartScalar } from "./visualizations/SmartScalar";
import { Table } from "./visualizations/Table/Table";
import { Text } from "./visualizations/Text";
import { WaterfallChart } from "./visualizations/WaterfallChart";

export default function () {
  registerVisualization(Scalar);
  registerVisualization(SmartScalar);
  registerVisualization(Progress);
  registerVisualization(Gauge);
  registerVisualization(Table);
  registerVisualization(LineChart);
  registerVisualization(AreaChart);
  registerVisualization(BarChart);
  registerVisualization(WaterfallChart);
  registerVisualization(ComboChart);
  registerVisualization(RowChart);
  registerVisualization(ScatterPlot);
  registerVisualization(PieChart);
  registerVisualization(Map);
  registerVisualization(Funnel);
  registerVisualization(ObjectDetail);
  registerVisualization(PivotTable);
  registerVisualization(SankeyChart);

  registerVisualization(ActionViz);
  registerVisualization(DashCardPlaceholder);
  registerVisualization(Heading);
  registerVisualization(LinkViz);
  registerVisualization(Text);
  registerVisualization(IFrameViz);

  registerVisualization(ListViz);

  setDefaultVisualization(Table);
}
