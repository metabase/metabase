import cx from "classnames";
import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  type CurrentRule,
  type HistoryCheck,
  type HistoryProfile,
  getFailedChecks,
  getWarningChecks,
  useHistoryReview,
  useHistoryReviewStatus,
  useTableStructures,
} from "metabase/metadata/table-structure";
import {
  Button,
  Card,
  Group,
  Icon,
  Paper,
  Stack,
  Text,
  UnstyledButton,
  rem,
} from "metabase/ui";
import type { Table } from "metabase-types/api";

import { useHistoryCheckSelection } from "../../contexts/HistoryEntitySelectionContext";

import { CheckCountBadges } from "./CheckCountBadges";
import S from "./HistoryChecks.module.css";
import {
  CHECK_STATUS_ICON,
  type EntityNoun,
  countOf,
  formatDate,
  getCheckDescription,
  getCheckScope,
  getCheckTitle,
  getEntityNoun,
} from "./history-labels";

export function TableHistoryVersions({
  table,
  readOnly,
}: {
  table: Table;
  readOnly: boolean;
}) {
  const status = useHistoryReviewStatus(table);

  if (status == null) {
    return null;
  }
  const { profileState } = status;
  if (profileState.status === "unbound") {
    return (
      <EmptyState
        message={t`Pick the entity key and valid from columns in Details to see this table's versions.`}
        spacing="sm"
      />
    );
  }
  if (profileState.status !== "loaded") {
    return (
      <LoadingAndErrorWrapper
        loading={profileState.status === "loading"}
        error={profileState.status === "error" ? profileState.error : null}
      />
    );
  }

  const { profile } = profileState;
  const noun = getEntityNoun(profile.durableKeyField);

  return (
    <Stack gap="xxl" data-testid="table-history-versions">
      <ReviewBar
        table={table}
        profile={profile}
        isConfirmed={status.isConfirmed}
        confirmedAt={status.confirmedAt}
        readOnly={readOnly}
      />
      <ChecksSection table={table} profile={profile} noun={noun} />
      <CoverageSection profile={profile} noun={noun} />
    </Stack>
  );
}

function ReviewBar({
  table,
  profile,
  isConfirmed,
  confirmedAt,
  readOnly,
}: {
  table: Table;
  profile: HistoryProfile;
  isConfirmed: boolean;
  confirmedAt: string | null;
  readOnly: boolean;
}) {
  const structure = useTableStructures().getTableStructure(table);
  const { confirm } = useHistoryReview(table);
  const failedCount = getFailedChecks(profile).length;
  const warningCount = getWarningChecks(profile).length;
  const hasIssues = failedCount > 0 || warningCount > 0;

  return (
    <Paper withBorder radius="lg" p="lg" data-testid="history-review-bar">
      <Group justify="space-between" wrap="nowrap" align="center" gap="lg">
        <Stack gap={4} miw={0}>
          <Group gap="sm">
            <Text fw="bold">{t`Review`}</Text>
            <CheckCountBadges
              failedCount={failedCount}
              warningCount={warningCount}
              isConfirmed={isConfirmed}
            />
          </Group>
          <Text size="sm" c="text-secondary">
            {isConfirmed
              ? t`Metadata reviewed by an admin on ${formatDate(confirmedAt)}. Data issues stay visible to analysts as notes.`
              : getCheckScope(profile, table)}
          </Text>
        </Stack>
        {!isConfirmed && (
          <Button
            variant="filled"
            disabled={readOnly}
            flex="0 0 auto"
            onClick={() => confirm(structure)}
            data-testid="confirm-history-button"
          >
            {hasIssues ? t`Confirm with known issues` : t`Confirm metadata`}
          </Button>
        )}
      </Group>
    </Paper>
  );
}

function ChecksSection({
  table,
  profile,
  noun,
}: {
  table: Table;
  profile: HistoryProfile;
  noun: EntityNoun;
}) {
  const { selectedCheckId, selectCheck } = useHistoryCheckSelection(table.id);
  return (
    <SidebarSection title={t`Checks`}>
      <Stack gap={rem(12)} role="list">
        {profile.checks.map((check) => (
          <CheckItem
            key={check.id}
            check={check}
            profile={profile}
            noun={noun}
            active={check.id === selectedCheckId}
            onSelect={() => selectCheck(check.id)}
          />
        ))}
      </Stack>
    </SidebarSection>
  );
}

function CheckItem({
  check,
  profile,
  noun,
  active,
  onSelect,
}: {
  check: HistoryCheck;
  profile: HistoryProfile;
  noun: EntityNoun;
  active: boolean;
  onSelect: () => void;
}) {
  const icon = CHECK_STATUS_ICON[check.status];
  return (
    <Card
      className={cx(S.card, { [S.active]: active })}
      bg={
        active ? "background_surface-brand-subtle" : "background_page-primary"
      }
      role="listitem"
      p={0}
      pb={1}
      withBorder
      data-testid="history-check"
    >
      <UnstyledButton
        className={S.button}
        aria-label={getCheckTitle(check.id)}
        px="lg"
        py={rem(12)}
        w="100%"
        onClick={onSelect}
      >
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <Icon name={icon.name} c={icon.color} mt={2} flex="0 0 auto" />
          <Stack gap={2} miw={0} flex={1}>
            <Text fw="bold" lineClamp={1}>
              {getCheckTitle(check.id)}
            </Text>
            <Text size="sm" c="text-secondary" lineClamp={1}>
              {getCheckDescription(check, profile, noun)}
            </Text>
          </Stack>
          <Icon name="chevronright" c="text-secondary" mt={4} flex="0 0 auto" />
        </Group>
      </UnstyledButton>
    </Card>
  );
}

function getCurrentRuleDescription(rule: CurrentRule) {
  const descriptions: Record<CurrentRule, string> = {
    "current-flag": t`Where the current flag is true`,
    "valid-to-is-null": t`Where valid to is empty`,
    "latest-per-key": t`The latest row per entity key (proposed)`,
  };
  return descriptions[rule];
}

function CoverageSection({
  profile,
  noun,
}: {
  profile: HistoryProfile;
  noun: EntityNoun;
}) {
  const versionsPerEntity =
    profile.entityCount > 0 ? profile.rowCount / profile.entityCount : 0;
  return (
    <SidebarSection title={t`Coverage`}>
      <DetailsTable>
        <DetailsRow
          label={t`Recorded`}
          value={
            <Stack gap={0} py="xs">
              <Text fw="bold">
                {t`${countOf(profile.entityCount, noun)} in ${profile.rowCount.toLocaleString()} records`}
              </Text>
              <Text size="sm" c="text-secondary">
                {t`${versionsPerEntity.toFixed(1)} records per ${noun.one} on average, up to ${profile.maxVersionCount}`}
              </Text>
            </Stack>
          }
        />
        <DetailsRow
          label={t`Current`}
          value={
            <Stack gap={0} py="xs">
              <Text fw="bold">
                {t`${profile.currentRowCount.toLocaleString()} current records`}
              </Text>
              <Text size="sm" c="text-secondary">
                {getCurrentRuleDescription(profile.currentRule)}
              </Text>
            </Stack>
          }
        />
        <DetailsRow
          label={t`Dates`}
          value={t`${formatDate(profile.firstValidFrom)} to ${formatDate(profile.lastValidFrom)}`}
        />
      </DetailsTable>
    </SidebarSection>
  );
}
