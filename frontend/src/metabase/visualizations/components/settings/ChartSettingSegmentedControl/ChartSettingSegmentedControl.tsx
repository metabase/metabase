import { SegmentedControl, type SegmentedControlItem } from "metabase/ui";
import type { ChartSettingSegmentedControlProps } from "metabase/viz-core";

/**
 * Setting values aren't always strings (some options are `null` for "Auto",
 * or booleans), but the control's are, so each item's value is its index.
 */
export const ChartSettingSegmentedControl = ({
  options,
  onChange,
  value,
}: ChartSettingSegmentedControlProps) => {
  const data: SegmentedControlItem<string>[] = options.map((option, index) =>
    option.icon
      ? {
          value: String(index),
          icon: option.icon,
          ariaLabel: option.name ?? String(option.value),
          withTooltip: option.name !== undefined,
        }
      : { value: String(index), label: option.name },
  );
  const selectedIndex = options.findIndex((option) => option.value === value);

  return (
    <SegmentedControl
      data={data}
      // An empty value matches no item, so nothing shows as selected.
      value={selectedIndex >= 0 ? String(selectedIndex) : ""}
      onChange={(index) => onChange(options[Number(index)].value)}
      fullWidth
    />
  );
};
