import { SegmentedControl, type SegmentedControlItem } from "metabase/ui";
import { getChartSettingLabelId } from "metabase/visualizations/components/settings/get-chart-setting-label-id";

type SegmentedControlWidgetProps<Value extends string> = {
  id: string;
  value: Value;
  onChange: (value: Value) => void;
  data: readonly SegmentedControlItem<Value>[];
};

/** A setting with a few options, named by the setting's title. */
export const SegmentedControlWidget = <Value extends string>({
  id,
  value,
  onChange,
  data,
}: SegmentedControlWidgetProps<Value>) => (
  <SegmentedControl
    aria-labelledby={getChartSettingLabelId(id)}
    value={value}
    data={data}
    fullWidth
    onChange={onChange}
  />
);
