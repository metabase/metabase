import { ActionIcon, Flex, Icon } from "metabase/ui";

import type { MetricsViewerDisplayType } from "../../../types/viewer-state";
import type { ChartTypeOption } from "../../../utils/tab-config";

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
    <Flex gap="xs">
      {chartTypes.map(({ type, icon }) => (
        <ActionIcon
          key={type}
          variant={value === type ? "filled" : "subtle"}
          color={value === type ? "brand" : "text-primary"}
          onClick={() => onChange(type)}
          aria-label={type}
        >
          <Icon name={icon} />
        </ActionIcon>
      ))}
    </Flex>
  );
}
