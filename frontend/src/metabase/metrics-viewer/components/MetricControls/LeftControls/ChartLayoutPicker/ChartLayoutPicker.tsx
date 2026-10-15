import { t } from "ttag";

import { trackStackedSeriesEnabled } from "metabase/metrics-viewer/analytics";
import { SegmentedControl } from "metabase/ui";

type ChartLayout = "default" | "stack";

type ChartLayoutPickerProps = {
  isStacked: boolean;
  onToggle: (stacked: boolean) => void;
};

export function ChartLayoutPicker({
  isStacked,
  onToggle,
}: ChartLayoutPickerProps) {
  const handleChange = (layout: ChartLayout) => {
    const stacked = layout === "stack";
    onToggle(stacked);
    if (stacked) {
      trackStackedSeriesEnabled();
    }
  };

  return (
    <SegmentedControl<ChartLayout>
      data-testid="chart-layout-picker"
      data={[
        {
          value: "default",
          ariaLabel: t`Default layout`,
          icon: "chart_layout_default",
          withTooltip: true,
        },
        {
          value: "stack",
          ariaLabel: t`Stack layout`,
          icon: "chart_layout_stack",
          withTooltip: true,
        },
      ]}
      value={isStacked ? "stack" : "default"}
      onChange={handleChange}
    />
  );
}
