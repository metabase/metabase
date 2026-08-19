import {
  registerSettingWidgetLoaders,
  registerVisualization,
  setDefaultVisualization,
} from "metabase/visualizations";

import { registerJsxFormatting } from "./lib/register-jsx-formatting";
import type * as SettingWidgets from "./setting-widgets";
import { AREA_CHART_DEFINITION } from "./visualizations/AreaChart/definition";
import { BAR_CHART_DEFINITION } from "./visualizations/BarChart/definition";
import { BOXPLOT_CHART_DEFINITION } from "./visualizations/BoxPlot/definition";
import { COMBO_CHART_DEFINITION } from "./visualizations/ComboChart/definition";
import { FUNNEL_CHART_DEFINITION } from "./visualizations/Funnel/definition";
import { GAUGE_CHART_DEFINITION } from "./visualizations/Gauge/definition";
import { LINE_CHART_DEFINITION } from "./visualizations/LineChart/definition";
import { LIST_DEFINITION } from "./visualizations/List/definition";
import { MAP_VIZ_DEFINITION } from "./visualizations/Map/definition";
import { OBJECT_DETAIL_DEFINITION } from "./visualizations/ObjectDetail/definition";
import { PIE_CHART_DEFINITION } from "./visualizations/PieChart/definition";
import { PIVOT_TABLE_DEFINITION } from "./visualizations/PivotTable/definition";
import { PROGRESS_CHART_DEFINITION } from "./visualizations/Progress/definition";
import { ROW_CHART_DEFINITION } from "./visualizations/RowChart/definition";
import { SANKEY_CHART_DEFINITION } from "./visualizations/SankeyChart/definition";
import { SCALAR_CHART_DEFINITION } from "./visualizations/Scalar/definition";
import { SCATTER_PLOT_DEFINITION } from "./visualizations/ScatterPlot/definition";
import { SMART_SCALAR_CHART_DEFINITION } from "./visualizations/SmartScalar/definition";
import { TABLE_DEFINITION } from "./visualizations/Table/definition";
import { TREEMAP_CHART_DEFINITION } from "./visualizations/TreemapChart/definition";
import { WATERFALL_CHART_DEFINITION } from "./visualizations/WaterfallChart/definition";

// Registration needs the definition only: the identifier, the icon, the
// settings schema and the column checks. Each chart component is loaded on
// demand so it stays out of the initial bundle.
function registerVisualizationComponents() {
  registerVisualization(SCALAR_CHART_DEFINITION, () =>
    import(/* webpackChunkName: "viz-scalar" */ "./visualizations/Scalar").then(
      (module) => module.Scalar,
    ),
  );
  registerVisualization(SMART_SCALAR_CHART_DEFINITION, () =>
    import(
      /* webpackChunkName: "viz-smart-scalar" */ "./visualizations/SmartScalar"
    ).then((module) => module.SmartScalar),
  );
  registerVisualization(PROGRESS_CHART_DEFINITION, () =>
    import(
      /* webpackChunkName: "viz-progress" */ "./visualizations/Progress"
    ).then((module) => module.Progress),
  );
  registerVisualization(GAUGE_CHART_DEFINITION, () =>
    import(/* webpackChunkName: "viz-gauge" */ "./visualizations/Gauge").then(
      (module) => module.Gauge,
    ),
  );
  registerVisualization(TABLE_DEFINITION, () =>
    import(
      /* webpackChunkName: "viz-table" */ "./visualizations/Table/Table"
    ).then((module) => module.Table),
  );
  registerVisualization(LINE_CHART_DEFINITION, () =>
    import(
      /* webpackChunkName: "viz-line" */ "./visualizations/LineChart"
    ).then((module) => module.LineChart),
  );
  registerVisualization(AREA_CHART_DEFINITION, () =>
    import(
      /* webpackChunkName: "viz-area" */ "./visualizations/AreaChart"
    ).then((module) => module.AreaChart),
  );
  registerVisualization(BAR_CHART_DEFINITION, () =>
    import(/* webpackChunkName: "viz-bar" */ "./visualizations/BarChart").then(
      (module) => module.BarChart,
    ),
  );
  registerVisualization(WATERFALL_CHART_DEFINITION, () =>
    import(
      /* webpackChunkName: "viz-waterfall" */ "./visualizations/WaterfallChart"
    ).then((module) => module.WaterfallChart),
  );
  registerVisualization(COMBO_CHART_DEFINITION, () =>
    import(
      /* webpackChunkName: "viz-combo" */ "./visualizations/ComboChart"
    ).then((module) => module.ComboChart),
  );
  registerVisualization(ROW_CHART_DEFINITION, () =>
    import(/* webpackChunkName: "viz-row" */ "./visualizations/RowChart").then(
      (module) => module.RowChart,
    ),
  );
  registerVisualization(SCATTER_PLOT_DEFINITION, () =>
    import(
      /* webpackChunkName: "viz-scatter" */ "./visualizations/ScatterPlot"
    ).then((module) => module.ScatterPlot),
  );
  registerVisualization(BOXPLOT_CHART_DEFINITION, () =>
    import(
      /* webpackChunkName: "viz-boxplot" */ "./visualizations/BoxPlot"
    ).then((module) => module.BoxPlot),
  );
  registerVisualization(PIE_CHART_DEFINITION, () =>
    import(/* webpackChunkName: "viz-pie" */ "./visualizations/PieChart").then(
      (module) => module.PieChart,
    ),
  );
  registerVisualization(MAP_VIZ_DEFINITION, () =>
    import(/* webpackChunkName: "viz-map" */ "./visualizations/Map").then(
      (module) => module.Map,
    ),
  );
  registerVisualization(FUNNEL_CHART_DEFINITION, () =>
    import(/* webpackChunkName: "viz-funnel" */ "./visualizations/Funnel").then(
      (module) => module.Funnel,
    ),
  );
  registerVisualization(OBJECT_DETAIL_DEFINITION, () =>
    import(
      /* webpackChunkName: "viz-object-detail" */ "./visualizations/ObjectDetail"
    ).then((module) => module.ObjectDetail),
  );
  registerVisualization(PIVOT_TABLE_DEFINITION, () =>
    import(
      /* webpackChunkName: "viz-pivot-table" */ "./visualizations/PivotTable"
    ).then((module) => module.PivotTable),
  );
  registerVisualization(SANKEY_CHART_DEFINITION, () =>
    import(
      /* webpackChunkName: "viz-sankey" */ "./visualizations/SankeyChart"
    ).then((module) => module.SankeyChart),
  );
  registerVisualization(TREEMAP_CHART_DEFINITION, () =>
    import(
      /* webpackChunkName: "viz-treemap" */ "./visualizations/TreemapChart"
    ).then((module) => module.TreemapChart),
  );

  registerVisualization(LIST_DEFINITION, () =>
    import(
      /* webpackChunkName: "viz-list" */ "./visualizations/List/components/ListViz"
    ).then((module) => module.ListViz),
  );

  setDefaultVisualization(TABLE_DEFINITION);
}

// The settings sidebar is the only thing that needs these, so each key holds a
// loader instead of the component. All the loaders name one module, so the
// widgets share a single chunk.
const settingWidget = (name: keyof typeof SettingWidgets) => () =>
  import(
    /* webpackChunkName: "chart-setting-widgets" */ "./setting-widgets"
  ).then((module) => module[name]);

function registerVisualizationSettingWidgets() {
  registerSettingWidgetLoaders({
    input: settingWidget("ChartSettingInput"),
    number: settingWidget("ChartSettingInputNumeric"),
    numberInput: settingWidget("ChartSettingNumberInput"),
    radio: settingWidget("ChartSettingRadio"),
    iconRadio: settingWidget("ChartSettingIconRadio"),
    select: settingWidget("ChartSettingSelect"),
    toggle: settingWidget("ChartSettingToggle"),
    segmentedControl: settingWidget("ChartSettingSegmentedControl"),
    field: settingWidget("ChartSettingFieldPicker"),
    fields: settingWidget("ChartSettingFieldsPicker"),
    fieldsPartition: settingWidget("ChartSettingFieldsPartition"),
    color: settingWidget("ChartSettingColorPicker"),
    colors: settingWidget("ChartSettingColorsPicker"),
    colorRangeSelector: settingWidget("ColorRangeSelector"),
    linkUrlInput: settingWidget("ChartSettingLinkUrlInput"),
    tableFormatting: settingWidget("ChartSettingsTableFormatting"),
    multiselect: settingWidget("ChartSettingMultiSelect"),
    enumToggle: settingWidget("ChartSettingEnumToggle"),
    goalInput: settingWidget("ChartSettingGoalInput"),
    maxCategories: settingWidget("ChartSettingMaxCategories"),
    orderedSimple: settingWidget("ChartSettingOrderedSimple"),
    segmentsEditor: settingWidget("ChartSettingSegmentsEditor"),
    seriesOrder: settingWidget("ChartSettingSeriesOrder"),
    tableColumns: settingWidget("ChartSettingTableColumns"),
    nestedColumns: settingWidget("NestedSettingColumns"),
    nestedSeries: settingWidget("NestedSettingSeries"),
    pieDimensions: settingWidget("DimensionsWidget"),
    pieSliceName: settingWidget("SliceNameWidget"),
    smartScalarComparison: settingWidget("SmartScalarComparisonWidget"),
    treemapGroups: settingWidget("TreemapGroupsPicker"),
  });
}

export function registerVisualizations() {
  registerVisualizationComponents();
  registerVisualizationSettingWidgets();
  registerJsxFormatting();
}
