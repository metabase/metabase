import { msgid, ngettext, t } from "ttag";

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
  useHistoryProfile,
  useHistoryReview,
  useHistoryReviewStatus,
  useTableStructures,
} from "metabase/metadata/table-structure";
import {
  Badge,
  Button,
  Group,
  Icon,
  Paper,
  Select,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { Table } from "metabase-types/api";

import { useHistoryEntitySelection } from "../../contexts/HistoryEntitySelectionContext";

import { CheckCountBadges } from "./CheckCountBadges";
import { describeCurrentRule } from "./HistoryBindingRows";
import {
  HistoryColumnsSection,
  HistoryPreviewSection,
} from "./HistoryColumnsSection";
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

const MAX_LISTED_ENTITIES = 3;

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
  const noun = getEntityNoun(table, profile.durableKeyField.name);

  return (
    <Stack gap="xxl" data-testid="table-history-versions">
      <ReviewBar
        table={table}
        profile={profile}
        isConfirmed={status.isConfirmed}
        confirmedAt={status.confirmedAt}
        readOnly={readOnly}
      />
      <ChecksSection
        table={table}
        profile={profile}
        noun={noun}
        readOnly={readOnly}
      />
      <CoverageSection profile={profile} noun={noun} />
      <ExampleSection profile={profile} noun={noun} />
      <HistoryPreviewSection
        table={table}
        profile={profile}
        noun={noun}
        readOnly={readOnly}
      />
      <HistoryColumnsSection
        table={table}
        profile={profile}
        noun={noun}
        readOnly={readOnly}
      />
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
            {hasIssues ? t`Confirm metadata anyway` : t`Confirm metadata`}
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
  readOnly,
}: {
  table: Table;
  profile: HistoryProfile;
  noun: EntityNoun;
  readOnly: boolean;
}) {
  return (
    <SidebarSection title={t`Checks`}>
      <DetailsTable>
        {profile.checks.map((check) => (
          <CheckRow
            key={check.id}
            table={table}
            check={check}
            profile={profile}
            noun={noun}
            readOnly={readOnly}
          />
        ))}
      </DetailsTable>
    </SidebarSection>
  );
}

function CheckRow({
  table,
  check,
  profile,
  noun,
  readOnly,
}: {
  table: Table;
  check: HistoryCheck;
  profile: HistoryProfile;
  noun: EntityNoun;
  readOnly: boolean;
}) {
  const icon = CHECK_STATUS_ICON[check.status];
  const listedKeys = check.entityKeys.slice(0, MAX_LISTED_ENTITIES);
  const hiddenCount = check.entityKeys.length - listedKeys.length;
  const offersRuleComparison =
    check.id === "one-current" && check.status === "failed";

  return (
    <Group
      px="lg"
      py="md"
      gap="md"
      align="flex-start"
      wrap="nowrap"
      data-testid="history-check"
    >
      <Icon name={icon.name} c={icon.color} mt={2} flex="0 0 auto" />
      <Stack gap="xs" miw={0} flex={1}>
        <Text fw="bold">{getCheckTitle(check.id)}</Text>
        <Text size="sm" c="text-secondary">
          {getCheckDescription(check, profile, noun)}
        </Text>
        {listedKeys.length > 0 && (
          <Group gap="xs">
            {listedKeys.map((entityKey) => (
              <EntityLink
                key={entityKey}
                entityKey={entityKey}
                profile={profile}
              />
            ))}
            {hiddenCount > 0 && (
              <Text size="sm" c="text-secondary">
                {t`and ${hiddenCount} more`}
              </Text>
            )}
          </Group>
        )}
        {offersRuleComparison && (
          <CurrentRuleComparison
            table={table}
            check={check}
            profile={profile}
            noun={noun}
            readOnly={readOnly}
          />
        )}
      </Stack>
    </Group>
  );
}

function getAffectedRecordCount(profile: HistoryProfile, check: HistoryCheck) {
  return profile.entities
    .filter((entity) => check.entityKeys.includes(entity.key))
    .flatMap((entity) => entity.versions)
    .filter((version) => version.isCurrent).length;
}

function CurrentRuleComparison({
  table,
  check,
  profile,
  noun,
  readOnly,
}: {
  table: Table;
  check: HistoryCheck;
  profile: HistoryProfile;
  noun: EntityNoun;
  readOnly: boolean;
}) {
  const { getTableStructure, setHistoryBinding } = useTableStructures();
  const structure = getTableStructure(table);
  const fields = table.fields ?? [];
  const alternative = {
    ...structure,
    history: { ...structure.history, currentFlagFieldId: null },
  };
  const alternativeState = useHistoryProfile(table, alternative.history, {
    skip: structure.history.currentFlagFieldId == null,
  });
  if (
    structure.history.currentFlagFieldId == null ||
    alternativeState.status !== "loaded"
  ) {
    return null;
  }
  const alternativeProfile = alternativeState.profile;
  const alternativeConflicts =
    alternativeProfile.checks.find((item) => item.id === "one-current")
      ?.entityKeys.length ?? 0;
  const currentEntityCount = alternativeProfile.entities.filter((entity) =>
    entity.versions.some((version) => version.isCurrent),
  ).length;
  const affectedRecordCount = getAffectedRecordCount(profile, check);

  return (
    <Paper withBorder radius="md" p="md" mt="xs">
      <Stack gap="sm">
        <Text size="sm" fw="bold">{t`Compare current-row rules`}</Text>
        <Group justify="space-between" wrap="nowrap" gap="md">
          <Stack gap={2} miw={0}>
            <Text size="sm">
              {t`Now: ${describeCurrentRule(structure, fields)}`}
            </Text>
            <Text size="sm" c="feedback-negative">
              {ngettext(
                msgid`${countOf(check.entityKeys.length, noun)} with two current records, ${affectedRecordCount} record affected`,
                `${countOf(check.entityKeys.length, noun)} with two current records, ${affectedRecordCount} records affected`,
                affectedRecordCount,
              )}
            </Text>
          </Stack>
          <Badge color="neutral" variant="light" flex="0 0 auto">
            {t`In use`}
          </Badge>
        </Group>
        <Group justify="space-between" wrap="nowrap" gap="md">
          <Stack gap={2} miw={0}>
            <Text size="sm">
              {t`Instead: ${describeCurrentRule(alternative, fields)}`}
            </Text>
            <Text
              size="sm"
              c={
                alternativeConflicts > 0
                  ? "feedback-negative"
                  : "text-secondary"
              }
            >
              {alternativeConflicts > 0
                ? t`${countOf(alternativeConflicts, noun)} with two current records`
                : t`No conflicts. ${countOf(currentEntityCount, noun)} have a current record.`}
            </Text>
          </Stack>
          <Button
            size="compact-sm"
            variant="filled"
            flex="0 0 auto"
            disabled={readOnly}
            onClick={() =>
              setHistoryBinding(table, { currentFlagFieldId: null })
            }
            data-testid="use-alternative-current-rule"
          >
            {t`Use this rule`}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

function EntityLink({
  entityKey,
  profile,
}: {
  entityKey: string;
  profile: HistoryProfile;
}) {
  const { setSelectedEntityKey } = useHistoryEntitySelection();
  const entity = profile.entities.find((entity) => entity.key === entityKey);
  return (
    <UnstyledButton onClick={() => setSelectedEntityKey(entityKey)}>
      <Badge color="brand" variant="light" style={{ cursor: "pointer" }}>
        {entity?.label ? `${entity.label} · ${entityKey}` : entityKey}
      </Badge>
    </UnstyledButton>
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

function ExampleSection({
  profile,
  noun,
}: {
  profile: HistoryProfile;
  noun: EntityNoun;
}) {
  const { selectedEntityKey, setSelectedEntityKey } =
    useHistoryEntitySelection();
  const entities = [...profile.entities].sort(
    (a, b) => b.versions.length - a.versions.length,
  );
  const options = entities.map((entity) => ({
    value: entity.key,
    label: t`${entity.label ?? entity.key} (${entity.key}), ${entity.versions.length} versions`,
  }));

  return (
    <SidebarSection title={t`Look at one ${noun.one}`}>
      <Select
        aria-label={t`Pick a ${noun.one}`}
        data={options}
        value={selectedEntityKey}
        placeholder={t`Pick a ${noun.one} to see their versions`}
        searchable
        leftSection={<Icon name="history" />}
        onChange={(entityKey) => setSelectedEntityKey(entityKey)}
      />
    </SidebarSection>
  );
}
