import { match } from "ts-pattern";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import {
  getSystemSegmentMissingColumnMessage,
  getSystemSegmentNotApplicableLabel,
} from "metabase/metadata/table-segments";
import { Badge, Box, Card, Flex, Icon, Stack, Text, rem } from "metabase/ui";

import { ClausePills } from "../ClausePills";
import { InferredIcon } from "../InferenceReview";
import type { ResolvedSystemSegment } from "../table-segments";

import { DefaultSegmentBadge } from "./SegmentItem";
import S from "./SegmentItem/SegmentItem.module.css";

interface SystemSegmentItemProps {
  segment: ResolvedSystemSegment;
  href: string;
  isDefault: boolean;
  onConfirm?: () => void;
}

/**
 * PROTOTYPE: mocked. A segment every table has, built from the column that
 * marks its rows. Opens its own page to pick that column.
 */
export function SystemSegmentItem({
  segment,
  href,
  isDefault,
  onConfirm,
}: SystemSegmentItemProps) {
  const isOff =
    segment.status === "not-set-up" || segment.status === "not-applicable";

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
      opacity={segment.status === "not-applicable" ? 0.6 : undefined}
    >
      <Stack gap="xs">
        <Flex align="center" gap="sm">
          <Icon name="segment" c={isOff ? "text-secondary" : "core-brand"} />
          <Text fw="bold">{segment.label}</Text>
          {segment.status === "guessed" && (
            <Box onClickCapture={(event) => event.preventDefault()}>
              <InferredIcon
                description={t`Inferred: ${segment.inference.signal}`}
                onConfirm={onConfirm}
              />
            </Box>
          )}
          {isDefault && <DefaultSegmentBadge />}
          <SystemSegmentStatusBadge segment={segment} />
        </Flex>
        <SystemSegmentSummary segment={segment} />
      </Stack>
    </Card>
  );
}

function SystemSegmentStatusBadge({
  segment,
}: {
  segment: ResolvedSystemSegment;
}) {
  return match(segment.status)
    .with("not-set-up", () => (
      <Badge variant="light" c="text-secondary" flex="0 0 auto">
        {t`Not set up`}
      </Badge>
    ))
    .with("not-applicable", () => (
      <Badge variant="light" c="text-secondary" flex="0 0 auto">
        {t`Off for this table`}
      </Badge>
    ))
    .with("on", "guessed", () => null)
    .exhaustive();
}

function SystemSegmentSummary({ segment }: { segment: ResolvedSystemSegment }) {
  return match(segment.status)
    .with("not-set-up", () => (
      <Text lh="lg" c="text-secondary">
        {getSystemSegmentMissingColumnMessage(segment.role)}{" "}
        <Text span c="text-brand">{t`Choose the column`}</Text>
      </Text>
    ))
    .with("not-applicable", () => (
      <Text lh="lg" c="text-secondary">
        {getSystemSegmentNotApplicableLabel(segment.role)}
      </Text>
    ))
    .with("on", "guessed", () => (
      <ClausePills
        clauses={segment.filterNames.map((name) => ({
          kind: "filter",
          name,
        }))}
      />
    ))
    .exhaustive();
}
