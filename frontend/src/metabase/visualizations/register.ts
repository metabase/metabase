import type { ComponentType } from "react";
import _ from "underscore";

import {
  EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID,
  isEmbeddingSdk,
} from "metabase/embedding-sdk/config";
import {
  convertLinkColumnToClickBehavior,
  removeInternalClickBehaviors,
} from "metabase/embedding-sdk/lib/links";
import {
  type ChartSettingColorRangeProps,
  type ComputedVisualizationSettings,
  type SettingsExtra,
  registerSettingWidgets,
  registerVisualization,
  setComputedSettingsTransform,
  setDefaultVisualization,
  setTooltipRootProvider,
} from "metabase/viz-core";

import { ChartNestedSettingColumns } from "./components/settings/ChartNestedSettingColumns";
import ChartNestedSettingSeries from "./components/settings/ChartNestedSettingSeries";
import { ChartSettingColorPicker } from "./components/settings/ChartSettingColorPicker";
import { ChartSettingColorsPicker } from "./components/settings/ChartSettingColorsPicker";
import { ChartSettingEnumToggle } from "./components/settings/ChartSettingEnumToggle";
import { ChartSettingFieldPicker } from "./components/settings/ChartSettingFieldPicker";
import { ChartSettingFieldsPartition } from "./components/settings/ChartSettingFieldsPartition";
import { ChartSettingFieldsPicker } from "./components/settings/ChartSettingFieldsPicker";
import { ChartSettingGoalInput } from "./components/settings/ChartSettingGoalInput";
import { ChartSettingIconRadio } from "./components/settings/ChartSettingIconRadio";
import { ChartSettingInput } from "./components/settings/ChartSettingInput";
import { ChartSettingInputNumeric } from "./components/settings/ChartSettingInputNumeric";
import ChartSettingLinkUrlInput from "./components/settings/ChartSettingLinkUrlInput";
import { ChartSettingMaxCategories } from "./components/settings/ChartSettingMaxCategories";
import { ChartSettingMultiSelect } from "./components/settings/ChartSettingMultiSelect";
import { chartSettingNestedSettings } from "./components/settings/ChartSettingNestedSettings";
import { ChartSettingNumberInput } from "./components/settings/ChartSettingNumberInput";
import { ChartSettingOrderedSimple } from "./components/settings/ChartSettingOrderedSimple";
import { ChartSettingRadio } from "./components/settings/ChartSettingRadio";
import { ChartSettingSegmentedControl } from "./components/settings/ChartSettingSegmentedControl";
import { ChartSettingSegmentsEditor } from "./components/settings/ChartSettingSegmentsEditor";
import { ChartSettingSelect } from "./components/settings/ChartSettingSelect";
import { ChartSettingSeriesOrder } from "./components/settings/ChartSettingSeriesOrder";
import { ChartSettingTableColumns } from "./components/settings/ChartSettingTableColumns";
import { ChartSettingToggle } from "./components/settings/ChartSettingToggle";
import { ChartSettingsTableFormatting } from "./components/settings/ChartSettingsTableFormatting";
import { ColorRangeSelector } from "./components/settings/ColorRangeSelector";
import { registerJsxFormatting } from "./lib/register-jsx-formatting";
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
import { DimensionsWidget } from "./visualizations/PieChart/DimensionsWidget";
import { SliceNameWidget } from "./visualizations/PieChart/SliceNameWidget";
import { PIE_CHART_DEFINITION } from "./visualizations/PieChart/definition";
import { PIVOT_TABLE_DEFINITION } from "./visualizations/PivotTable/definition";
import { PROGRESS_CHART_DEFINITION } from "./visualizations/Progress/definition";
import { ROW_CHART_DEFINITION } from "./visualizations/RowChart/definition";
import { SANKEY_CHART_DEFINITION } from "./visualizations/SankeyChart/definition";
import { SCALAR_CHART_DEFINITION } from "./visualizations/Scalar/definition";
import { SCATTER_PLOT_DEFINITION } from "./visualizations/ScatterPlot/definition";
import { SmartScalarComparisonWidget } from "./visualizations/SmartScalar/SettingsComponents/SmartScalarSettingsWidgets";
import { SMART_SCALAR_CHART_DEFINITION } from "./visualizations/SmartScalar/definition";
import { TABLE_DEFINITION } from "./visualizations/Table/definition";
import { TreemapGroupsPicker } from "./visualizations/TreemapChart/TreemapGroupsPicker";
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

function registerVisualizationSettingWidgets() {
  registerSettingWidgets({
    input: ChartSettingInput,
    number: ChartSettingInputNumeric,
    numberInput: ChartSettingNumberInput,
    radio: ChartSettingRadio,
    iconRadio: ChartSettingIconRadio,
    select: ChartSettingSelect,
    toggle: ChartSettingToggle,
    segmentedControl: ChartSettingSegmentedControl,
    field: ChartSettingFieldPicker,
    fields: ChartSettingFieldsPicker,
    fieldsPartition: ChartSettingFieldsPartition,
    color: ChartSettingColorPicker,
    colors: ChartSettingColorsPicker,
    colorRangeSelector:
      ColorRangeSelector satisfies ComponentType<ChartSettingColorRangeProps>,
    linkUrlInput: ChartSettingLinkUrlInput,
    tableFormatting: ChartSettingsTableFormatting,
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

function transformComputedSettingsForSdk(
  computedSettings: ComputedVisualizationSettings,
  extra: SettingsExtra,
): ComputedVisualizationSettings {
  if (!isEmbeddingSdk()) {
    return computedSettings;
  }

  const shouldKeepInternalClickBehavior = extra.enableEntityNavigation;

  return _.compose(
    // remove internal click behaviors unless internal navigation is enabled
    shouldKeepInternalClickBehavior ? _.identity : removeInternalClickBehaviors,
    convertLinkColumnToClickBehavior,
  )(computedSettings);
}

function registerSdkAwareBehaviors() {
  setComputedSettingsTransform(transformComputedSettingsForSdk);
  setTooltipRootProvider(() =>
    isEmbeddingSdk()
      ? document.getElementById(EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID)
      : document.body,
  );
}

export function registerVisualizations() {
  registerVisualizationComponents();
  registerVisualizationSettingWidgets();
  registerJsxFormatting();
  registerSdkAwareBehaviors();
}
