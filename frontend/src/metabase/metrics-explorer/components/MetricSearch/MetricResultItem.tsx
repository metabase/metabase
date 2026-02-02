import type { IconName } from "metabase/ui";
import { Flex, Icon, Stack, Text } from "metabase/ui";

import S from "./MetricResultItem.module.css";

interface MetricResultItemProps {
  name: string;
  description?: string;
  icon?: IconName;
  tableName?: string | null;
  active?: boolean;
  onClick?: () => void;
}

export function MetricResultItem({
  name,
  description,
  icon = "metric",
  tableName,
  active = false,
  onClick,
}: MetricResultItemProps) {
  return (
    <Flex
      p=".75rem"
      mx="1rem"
      miw="0"
      align="start"
      gap="0.5rem"
      className={S.resultItem}
      bg={active ? "background-hover" : undefined}
      c="text-primary"
      aria-label={name}
      wrap="nowrap"
      onClick={onClick}
    >
      <Icon name={icon} className={S.icon} c="text-secondary" />
      <Stack gap="xs" flex="1" className={S.content}>
        <Text c="inherit" component="span" lh="1rem" lineClamp={1} miw={0}>
          {name}
        </Text>
        {tableName && (
          <Text
            c="text-tertiary"
            component="span"
            lh="1rem"
            fz="sm"
            className={S.description}
          >
            {tableName}
          </Text>
        )}
        {description && (
          <Text
            c="text-tertiary"
            component="span"
            lh="1rem"
            className={S.description}
          >
            {description}
          </Text>
        )}
      </Stack>
    </Flex>
  );
}
