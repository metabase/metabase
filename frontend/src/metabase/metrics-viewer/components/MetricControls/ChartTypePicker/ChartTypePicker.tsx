import { ActionIcon, Flex, Icon } from "metabase/ui";

import type { MetricsViewerDisplayType } from "../../../types/viewer-state";
import type { ChartTypeOption } from "../../../utils/tab-config";

import S from "./ChartTypePicker.module.css";

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
    <Flex gap="xs" bg="background-secondary" p="xs" bdrs="md">
      {chartTypes.map(({ type, icon }) => (
        <ActionIcon
          w="2rem"
          key={type}
          variant={value === type ? "filled" : "subtle"}
          bg={value === type ? "background-primary" : undefined}
          onClick={() => onChange(type)}
          aria-label={type}
          className={value === type ? S.selected : undefined}
        >
          <Icon name={icon} c={value === type ? "brand" : "text-primary"} />
        </ActionIcon>
      ))}
    </Flex>
  );
}
