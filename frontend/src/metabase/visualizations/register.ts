import {
  registerVisualization,
  setDefaultVisualization,
} from "metabase/visualizations";

import { AreaChart } from "./visualizations/AreaChart";
import { BarChart } from "./visualizations/BarChart";
import { BoxPlot } from "./visualizations/BoxPlot";
import { ComboChart } from "./visualizations/ComboChart";
import { Funnel } from "./visualizations/Funnel";
import { Gauge } from "./visualizations/Gauge";
import { LineChart } from "./visualizations/LineChart";
import { ListViz } from "./visualizations/List/components/ListViz";
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
import { TreemapChart } from "./visualizations/TreemapChart";
import { WaterfallChart } from "./visualizations/WaterfallChart";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function (): void {
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(Scalar);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(SmartScalar);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(Progress);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(Gauge);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(Table);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(LineChart);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(AreaChart);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(BarChart);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(WaterfallChart);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(ComboChart);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(RowChart);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(ScatterPlot);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(BoxPlot);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(PieChart);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(Map);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(Funnel);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(ObjectDetail);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(PivotTable);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(SankeyChart);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(TreemapChart);

  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(ListViz);

  // @ts-expect-error: incompatible prop types with registerVisualization
  setDefaultVisualization(Table);
}
