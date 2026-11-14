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

import { ClausePills, type QueryClause } from "../../ClausePills";

import S from "./SegmentItem.module.css";

type SegmentItemProps = {
  segment: Segment;
  href: string;
  /** The table's questions start from this segment */
  isDefault?: boolean;
  /** Its definition's clauses, one pill each; else the server's description */
  clauses?: QueryClause[];
};

export function SegmentItem({
  segment,
  href,
  isDefault,
  clauses,
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

        {clauses != null && clauses.length > 0 ? (
          <ClausePills clauses={clauses} />
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
