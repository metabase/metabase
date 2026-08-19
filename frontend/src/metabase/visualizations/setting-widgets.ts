import { ChartNestedSettingColumns } from "./components/settings/ChartNestedSettingColumns";
import ChartNestedSettingSeries from "./components/settings/ChartNestedSettingSeries";
import { chartSettingNestedSettings } from "./components/settings/ChartSettingNestedSettings";

export { ColorRangeSelector } from "metabase/common/components/ColorRangeSelector";

export { ChartSettingColorPicker } from "./components/settings/ChartSettingColorPicker";
export { ChartSettingColorsPicker } from "./components/settings/ChartSettingColorsPicker";
export { ChartSettingEnumToggle } from "./components/settings/ChartSettingEnumToggle";
export { ChartSettingFieldPicker } from "./components/settings/ChartSettingFieldPicker";
export { ChartSettingFieldsPartition } from "./components/settings/ChartSettingFieldsPartition";
export { ChartSettingFieldsPicker } from "./components/settings/ChartSettingFieldsPicker";
export { ChartSettingGoalInput } from "./components/settings/ChartSettingGoalInput";
export { ChartSettingIconRadio } from "./components/settings/ChartSettingIconRadio";
export { ChartSettingInput } from "./components/settings/ChartSettingInput";
export { ChartSettingInputNumeric } from "./components/settings/ChartSettingInputNumeric";
export { default as ChartSettingLinkUrlInput } from "./components/settings/ChartSettingLinkUrlInput";
export { ChartSettingMaxCategories } from "./components/settings/ChartSettingMaxCategories";
export { ChartSettingMultiSelect } from "./components/settings/ChartSettingMultiSelect";
export { ChartSettingNumberInput } from "./components/settings/ChartSettingNumberInput";
export { ChartSettingOrderedSimple } from "./components/settings/ChartSettingOrderedSimple";
export { ChartSettingRadio } from "./components/settings/ChartSettingRadio";
export { ChartSettingSegmentedControl } from "./components/settings/ChartSettingSegmentedControl";
export { ChartSettingSegmentsEditor } from "./components/settings/ChartSettingSegmentsEditor";
export { ChartSettingSelect } from "./components/settings/ChartSettingSelect";
export { ChartSettingSeriesOrder } from "./components/settings/ChartSettingSeriesOrder";
export { ChartSettingTableColumns } from "./components/settings/ChartSettingTableColumns";
export { ChartSettingToggle } from "./components/settings/ChartSettingToggle";
export { ChartSettingsTableFormatting } from "./components/settings/ChartSettingsTableFormatting";
export { DimensionsWidget } from "./visualizations/PieChart/DimensionsWidget";
export { SliceNameWidget } from "./visualizations/PieChart/SliceNameWidget";
export { SmartScalarComparisonWidget } from "./visualizations/SmartScalar/SettingsComponents/SmartScalarSettingsWidgets";
export { TreemapGroupsPicker } from "./visualizations/TreemapChart/TreemapGroupsPicker";

export const NestedSettingColumns = chartSettingNestedSettings(
  ChartNestedSettingColumns,
);
export const NestedSettingSeries = chartSettingNestedSettings(
  ChartNestedSettingSeries,
);
