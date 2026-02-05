import { Link } from "react-router";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import type { ColorName } from "metabase/lib/colors/types";
import type { IconName } from "metabase/ui";
import { Card, Flex, Icon, Stack, Text } from "metabase/ui";

import S from "./EntityListItem.module.css";

type EntityListItemProps = {
  name: string;
  description?: string | null;
  icon: IconName;
  iconColor?: ColorName;
  href: string;
};

export function EntityListItem({
  name,
  description,
  icon,
  iconColor = "brand",
  href,
}: EntityListItemProps) {
  return (
    <Card
      className={S.card}
      component={Link}
      to={href}
      aria-label={name}
      role="listitem"
      px="md"
      py="0.75rem"
      withBorder
    >
      <Stack gap="xs">
        <Flex align="center" gap="sm">
          <Icon name={icon} c={iconColor} />
          <Ellipsified lines={1} tooltip={name}>
            <Text fw="bold">{name}</Text>
          </Ellipsified>
        </Flex>

        {description && (
          <Text data-testid="list-item-description">{description}</Text>
        )}
      </Stack>
    </Card>
  );
}
