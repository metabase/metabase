import { Flex, Icon, Text } from "metabase/ui";
import type { IconName } from "metabase/ui";

import S from "./MetricResultItem.module.css";

interface MetricResultItemProps {
  name: string;
  slug?: string;
  icon?: IconName;
  active?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
}

export function MetricResultItem({
  name,
  slug,
  icon = "metric",
  active = false,
  isSelected = false,
  onClick,
}: MetricResultItemProps) {
  return (
    <Flex
      px="0.75rem"
      py="0.5rem"
      align="center"
      gap="0.5rem"
      className={S.resultItem}
      data-active={active || undefined}
      onClick={onClick}
    >
      <Icon name={icon} className={S.icon} />
      <Text className={S.name} lh="1rem" lineClamp={1} flex="1">
        {name}
      </Text>
      {slug && (
        <Text className={S.slug} fz="0.75rem">
          {slug}
        </Text>
      )}
      {isSelected && <Icon name="check" className={S.selectedIcon} size={16} />}
    </Flex>
  );
}
