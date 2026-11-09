import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { Card, Flex, Icon, Stack, Text, rem } from "metabase/ui";

import { ClausePills } from "../ClausePills";
import type { ResolvedSystemSegment } from "../table-segments";

import { DefaultSegmentBadge } from "./SegmentItem";
import S from "./SegmentItem/SegmentItem.module.css";

interface SystemSegmentItemProps {
  segment: ResolvedSystemSegment;
  href: string;
  isDefault: boolean;
}

/**
 * PROTOTYPE: mocked. A segment every table has, built from its lifecycle
 * columns. Opens its own page to edit, like a custom segment.
 */
export function SystemSegmentItem({
  segment,
  href,
  isDefault,
}: SystemSegmentItemProps) {
  const hasFilters = segment.filterNames.length > 0;

  return (
    <Card
      className={S.card}
      component={Link}
      to={href}
      aria-label={segment.label}
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
          <Text fw="bold">{segment.label}</Text>
          {isDefault && <DefaultSegmentBadge />}
          {segment.isEdited && (
            <Text size="sm" c="text-secondary">{t`Edited`}</Text>
          )}
        </Flex>
        {hasFilters ? (
          <ClausePills
            clauses={segment.filterNames.map((name) => ({
              kind: "filter",
              name,
            }))}
          />
        ) : (
          <Text lh="lg" c="text-secondary">
            {t`No matching column found. Open it to set it up.`}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
