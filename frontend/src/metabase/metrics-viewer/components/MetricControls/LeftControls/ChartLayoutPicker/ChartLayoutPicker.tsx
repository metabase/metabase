import { t } from "ttag";

import { trackStackedSeriesEnabled } from "metabase/metrics-viewer/analytics";
import { Icon, SegmentedControl, Tooltip } from "metabase/ui";

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
          icon: (
            <Tooltip label={t`Default layout`}>
              <Icon name="chart_layout_default" />
            </Tooltip>
          ),
        },
        {
          value: "stack",
          ariaLabel: t`Stack layout`,
          icon: (
            <Tooltip label={t`Stack layout`}>
              <Icon name="chart_layout_stack" />
            </Tooltip>
          ),
        },
      ]}
      value={isStacked ? "stack" : "default"}
      onChange={handleChange}
    />
  );
}
