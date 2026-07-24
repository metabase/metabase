import {
  registerSettingWidgets,
  registerVisualization,
  setDefaultVisualization,
} from "metabase/visualizations";
import { registerJsxFormatting } from "metabase/visualizations/lib/formatting/ui";

import { ChartNestedSettingColumns } from "./components/settings/ChartNestedSettingColumns";
import ChartNestedSettingSeries from "./components/settings/ChartNestedSettingSeries";
import { ChartSettingColorPicker } from "./components/settings/ChartSettingColorPicker";
import { ChartSettingColorsPicker } from "./components/settings/ChartSettingColorsPicker";
import { ChartSettingEnumToggle } from "./components/settings/ChartSettingEnumToggle";
import { ChartSettingFieldPicker } from "./components/settings/ChartSettingFieldPicker";
import { ChartSettingFieldsPartition } from "./components/settings/ChartSettingFieldsPartition";
import { ChartSettingFieldsPicker } from "./components/settings/ChartSettingFieldsPicker";
import { ChartSettingGoalInput } from "./components/settings/ChartSettingGoalInput";
import { ChartSettingInput } from "./components/settings/ChartSettingInput";
import { ChartSettingInputNumeric } from "./components/settings/ChartSettingInputNumeric";
import { ChartSettingMaxCategories } from "./components/settings/ChartSettingMaxCategories";
import { ChartSettingMultiSelect } from "./components/settings/ChartSettingMultiSelect";
import { chartSettingNestedSettings } from "./components/settings/ChartSettingNestedSettings";
import { ChartSettingOrderedSimple } from "./components/settings/ChartSettingOrderedSimple";
import { ChartSettingRadio } from "./components/settings/ChartSettingRadio";
import { ChartSettingSegmentedControl } from "./components/settings/ChartSettingSegmentedControl";
import { ChartSettingSegmentsEditor } from "./components/settings/ChartSettingSegmentsEditor";
import { ChartSettingSelect } from "./components/settings/ChartSettingSelect";
import { ChartSettingSeriesOrder } from "./components/settings/ChartSettingSeriesOrder";
import { ChartSettingTableColumns } from "./components/settings/ChartSettingTableColumns";
import { ChartSettingToggle } from "./components/settings/ChartSettingToggle";
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
import { DimensionsWidget } from "./visualizations/PieChart/DimensionsWidget";
import { SliceNameWidget } from "./visualizations/PieChart/SliceNameWidget";
import { PivotTable } from "./visualizations/PivotTable";
import { Progress } from "./visualizations/Progress";
import { RowChart } from "./visualizations/RowChart";
import { SankeyChart } from "./visualizations/SankeyChart";
import { Scalar } from "./visualizations/Scalar";
import { ScatterPlot } from "./visualizations/ScatterPlot";
import { SmartScalar } from "./visualizations/SmartScalar";
import { SmartScalarComparisonWidget } from "./visualizations/SmartScalar/SettingsComponents/SmartScalarSettingsWidgets";
import { Table } from "./visualizations/Table/Table";
import { TreemapChart } from "./visualizations/TreemapChart";
import { TreemapGroupsPicker } from "./visualizations/TreemapChart/TreemapGroupsPicker";
import { WaterfallChart } from "./visualizations/WaterfallChart";

function registerVisualizationComponents() {
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
  registerVisualization(BoxPlot);
  registerVisualization(PieChart);
  registerVisualization(Map);
  registerVisualization(Funnel);
  // @ts-expect-error: ObjectDetail uses its own OwnProps shape; migrate props to VisualizationProps
  registerVisualization(ObjectDetail);
  registerVisualization(PivotTable);
  registerVisualization(SankeyChart);
  registerVisualization(TreemapChart);

  registerVisualization(ListViz);

  setDefaultVisualization(Table);
}

function registerVisualizationSettingWidgets() {
  registerSettingWidgets({
    input: ChartSettingInput,
    number: ChartSettingInputNumeric,
    radio: ChartSettingRadio,
    select: ChartSettingSelect,
    toggle: ChartSettingToggle,
    segmentedControl: ChartSettingSegmentedControl,
    field: ChartSettingFieldPicker,
    fields: ChartSettingFieldsPicker,
    fieldsPartition: ChartSettingFieldsPartition,
    color: ChartSettingColorPicker,
    colors: ChartSettingColorsPicker,
    multiselect: ChartSettingMultiSelect,
    enumToggle: ChartSettingEnumToggle,
    goalInput: ChartSettingGoalInput,
    maxCategories: ChartSettingMaxCategories,
    orderedSimple: ChartSettingOrderedSimple,
    segmentsEditor: ChartSettingSegmentsEditor,
    seriesOrder: ChartSettingSeriesOrder,
    tableColumns: ChartSettingTableColumns,
    nestedColumns: chartSettingNestedSettings(ChartNestedSettingColumns),
    nestedSeries: chartSettingNestedSettings(ChartNestedSettingSeries),
    pieDimensions: DimensionsWidget,
    pieSliceName: SliceNameWidget,
    smartScalarComparison: SmartScalarComparisonWidget,
    treemapGroups: TreemapGroupsPicker,
  });
}

export function registerVisualizations() {
  registerVisualizationComponents();
  registerVisualizationSettingWidgets();
  registerJsxFormatting();
}
