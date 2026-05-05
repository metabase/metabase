import type { IconName } from "metabase/ui";
import { ActionIcon, Flex, Icon } from "metabase/ui";

import S from "./ChartTypePicker.module.css";

type ChartTypeOption = {
  type: string;
  icon: IconName;
};

type ChartTypePickerProps = {
  chartTypes: ChartTypeOption[];
  value: string;
  onChange: (type: string) => void;
};

export function ChartTypePicker({
  chartTypes,
  value,
  onChange,
}: ChartTypePickerProps) {
  return (
    <Flex
      h={32}
      align="center"
      gap="xs"
      bg="background-secondary"
      px="xs"
      bdrs="md"
    >
      {chartTypes.map(({ type, icon }) => (
        <ActionIcon
          w="2rem"
          key={type}
          size={24}
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
