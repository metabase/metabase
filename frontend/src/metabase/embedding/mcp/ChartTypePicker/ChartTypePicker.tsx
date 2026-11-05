import { SegmentedControl } from "metabase/ui";
import type { CardDisplayType, IconName } from "metabase-types/api";

type ChartTypeOption = {
  type: CardDisplayType;
  icon: IconName;
};

type ChartTypePickerProps = {
  chartTypes: ChartTypeOption[];
  value: CardDisplayType | null;
  onChange: (type: CardDisplayType) => void;
};

export function ChartTypePicker({
  chartTypes,
  value,
  onChange,
}: ChartTypePickerProps) {
  return (
    <SegmentedControl
      data={chartTypes.map(({ type, icon }) => ({
        value: type,
        ariaLabel: type,
        icon,
      }))}
      value={value ?? undefined}
      onChange={onChange}
    />
  );
}
