import { ActionIcon, Flex, Icon } from "metabase/ui";
import type { CardDisplayType, IconName } from "metabase-types/api";

import S from "./ChartTypePicker.module.css";

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
    <Flex
      h={32}
      align="center"
      gap="xs"
      bg="background_page-secondary"
      px="xs"
      bdrs="md"
    >
      {chartTypes.map(({ type, icon }) => (
        <ActionIcon
          w="2rem"
          key={type}
          size={24}
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
