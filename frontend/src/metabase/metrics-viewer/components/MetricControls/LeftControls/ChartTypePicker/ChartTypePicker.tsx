import type { MetricsViewerDisplayType } from "metabase/metrics-viewer/types";
import type { ChartTypeOption } from "metabase/metrics-viewer/utils";
import { SegmentedControl } from "metabase/ui";

type ChartTypePickerProps = {
  chartTypes: ChartTypeOption[];
  value: MetricsViewerDisplayType;
  onChange: (type: MetricsViewerDisplayType) => void;
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
      value={value}
      onChange={onChange}
    />
  );
}
