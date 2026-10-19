import { match } from "ts-pattern";
import { t } from "ttag";

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
        ariaLabel: match(type)
          .with("line", () => t`Line`)
          .with("area", () => t`Area`)
          .with("bar", () => t`Bar`)
          .with("map", () => t`Map`)
          .with("scatter", () => t`Scatter`)
          .with("scalar", () => t`Number`)
          .exhaustive(),
        icon,
      }))}
      value={value}
      onChange={onChange}
    />
  );
}
