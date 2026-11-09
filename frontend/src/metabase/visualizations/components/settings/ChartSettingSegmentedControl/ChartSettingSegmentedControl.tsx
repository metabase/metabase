import { SegmentedControl, type SegmentedControlItem } from "metabase/ui";
import {
  type ChartSettingSegmentedControlOption,
  type ChartSettingSegmentedControlProps,
  encodeWidgetValue,
} from "metabase/viz-core";

import { getChartSettingLabelId } from "../get-chart-setting-label-id";

export const ChartSettingSegmentedControl = ({
  id,
  options,
  onChange,
  value,
  disabled,
}: ChartSettingSegmentedControlProps) => {
  const handleChange = (encodedValue: string) => {
    const option = options.find(
      (option) => encodeWidgetValue(option.value) === encodedValue,
    );
    if (option) {
      onChange(option.value);
    }
  };

  return (
    <SegmentedControl
      fullWidth
      // Settings live in narrow sidebars and popovers; tighter segments
      // leave more room for labels before they truncate.
      itemPaddingX="sm"
      aria-labelledby={id ? getChartSettingLabelId(id) : undefined}
      data={options.map(getSegmentedControlItem)}
      value={encodeWidgetValue(value)}
      onChange={handleChange}
      disabled={disabled}
    />
  );
};

function getSegmentedControlItem({
  name,
  value,
  icon,
}: ChartSettingSegmentedControlOption): SegmentedControlItem<string> {
  const encodedValue = encodeWidgetValue(value);

  if (icon === undefined) {
    return { value: encodedValue, label: name };
  }

  return { value: encodedValue, icon, ariaLabel: name };
}
