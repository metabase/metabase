import { SegmentedControl, type SegmentedControlItem } from "metabase/ui";
import {
  type ChartSettingSegmentedControlOption,
  type ChartSettingSegmentedControlProps,
  encodeWidgetValue,
} from "metabase/viz-core";

export const ChartSettingSegmentedControl = ({
  options,
  onChange,
  value,
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
      data={options.map(getSegmentedControlItem)}
      value={encodeWidgetValue(value)}
      onChange={handleChange}
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
