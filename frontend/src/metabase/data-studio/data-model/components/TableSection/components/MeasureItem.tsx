import { Link } from "react-router";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Card, Flex, Icon, Stack, Text } from "metabase/ui";
import type { Measure } from "metabase-types/api";

import S from "./MeasureItem.module.css";

type MeasureItemProps = {
  measure: Measure;
  href: string;
};

export function MeasureItem({ measure, href }: MeasureItemProps) {
  return (
    <Card
      className={S.card}
      component={Link}
      to={href}
      aria-label={measure.name}
      role="listitem"
      px="md"
      py="0.75rem"
      withBorder
    >
      <Stack gap="xs">
        <Flex align="center" gap="sm">
          <Icon name="sum" c="brand" />
          <Ellipsified lines={1} tooltip={measure.name}>
            <Text fw="bold">{measure.name}</Text>
          </Ellipsified>
        </Flex>

        {measure.definition_description && (
          <Text data-testid="list-item-description">
            {measure.definition_description}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
