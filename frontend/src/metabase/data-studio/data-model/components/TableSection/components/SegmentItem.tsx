import { Link } from "react-router";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Card, Flex, Icon, Stack, Text } from "metabase/ui";
import type { Segment } from "metabase-types/api";

import S from "./SegmentItem.module.css";

type SegmentItemProps = {
  segment: Segment;
  href: string;
};

export function SegmentItem({ segment, href }: SegmentItemProps) {
  return (
    <Card
      className={S.card}
      component={Link}
      to={href}
      aria-label={segment.name}
      role="listitem"
      px="md"
      py="0.75rem"
      withBorder
    >
      <Stack gap="xs">
        <Flex align="center" gap="sm">
          <Icon name="segment2" c="brand" />
          <Ellipsified lines={1} tooltip={segment.name}>
            <Text fw="bold">{segment.name}</Text>
          </Ellipsified>
        </Flex>

        {segment.definition_description && (
          <Text data-testid="list-item-description">
            {segment.definition_description}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
