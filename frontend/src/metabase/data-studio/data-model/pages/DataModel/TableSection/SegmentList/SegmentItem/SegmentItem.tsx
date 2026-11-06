import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import {
  Badge,
  Card,
  Ellipsified,
  Flex,
  Icon,
  Stack,
  Text,
  rem,
} from "metabase/ui";
import type { Segment } from "metabase-types/api";

import { FilterPills } from "../FilterPills";

import S from "./SegmentItem.module.css";

type SegmentItemProps = {
  segment: Segment;
  href: string;
  /** The table's questions start from this segment */
  isDefault?: boolean;
  /** Its filter clauses, one pill each; else the server's description */
  filterNames?: string[];
};

export function SegmentItem({
  segment,
  href,
  isDefault,
  filterNames,
}: SegmentItemProps) {
  return (
    <Card
      className={S.card}
      component={Link}
      to={href}
      aria-label={segment.name}
      role="listitem"
      px="lg"
      py={rem(12)}
      radius="lg"
      shadow="none"
      withBorder
    >
      <Stack gap="xs">
        <Flex align="center" gap="sm">
          <Icon name="segment" c="core-brand" />
          <Ellipsified lines={1} tooltip={segment.name}>
            <Text fw="bold">{segment.name}</Text>
          </Ellipsified>
          {isDefault && <DefaultSegmentBadge />}
        </Flex>

        {filterNames != null && filterNames.length > 0 ? (
          <FilterPills names={filterNames} />
        ) : (
          segment.definition_description && (
            <Text lh="lg" data-testid="list-item-description">
              {segment.definition_description}
            </Text>
          )
        )}
      </Stack>
    </Card>
  );
}

/** Marks the segment a table's questions start from */
export function DefaultSegmentBadge() {
  return (
    <Badge variant="light" flex="0 0 auto">
      {t`Default`}
    </Badge>
  );
}
