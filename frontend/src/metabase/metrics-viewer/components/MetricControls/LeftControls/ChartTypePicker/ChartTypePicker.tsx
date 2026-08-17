import type { MetricsViewerDisplayType } from "metabase/metrics-viewer/types";
import type { ChartTypeOption } from "metabase/metrics-viewer/utils";
import { ActionIcon, Flex, Icon } from "metabase/ui";

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
    <Flex
      className={S.root}
      gap="xs"
      bg="background_page-secondary"
      p="xs"
      bdrs="md"
    >
      {chartTypes.map(({ type, icon }) => (
        <ActionIcon
          w="2rem"
          h="1.5rem"
          key={type}
          variant={value === type ? "filled" : "subtle"}
          bg={value === type ? "background_page-primary" : undefined}
          onClick={() => onChange(type)}
          aria-label={type}
          className={value === type ? S.selected : undefined}
        >
          <Icon
            name={icon}
            c={value === type ? "core-brand" : "text-primary"}
          />
        </ActionIcon>
      ))}
    </Flex>
  );
}
