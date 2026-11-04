import { useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import {
  type CurrentRule,
  type HistoryBinding,
  type HistoryCheck,
  type HistoryCheckId,
  type HistoryEntity,
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
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "metabase/ui";
import { isNotNull } from "metabase/utils/types";
import type { Field, Table } from "metabase-types/api";

import { useHistoryEntitySelection } from "../../contexts/HistoryEntitySelectionContext";

import { CheckCountBadges } from "./CheckCountBadges";
import { describeCurrentRule } from "./HistoryBindingRows";
import { HistoryPreviewSection } from "./HistoryPreviewSection";
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
const CHECK_PAGE_SIZE = 10;

export function TableHistoryVersions({
  table,
  readOnly,
}: {
  table: Table;
  readOnly: boolean;
}) {
  const status = useHistoryReviewStatus(table);
  const [openCheckId, setOpenCheckId] = useState<HistoryCheckId | null>(null);

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
  const openCheck = profile.checks.find((check) => check.id === openCheckId);

  if (openCheck != null) {
    return (
      <CheckDetails
        table={table}
        check={openCheck}
        profile={profile}
        noun={noun}
        onBack={() => setOpenCheckId(null)}
      />
    );
  }

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
        onOpenCheck={setOpenCheckId}
      />
      <CoverageSection profile={profile} noun={noun} />
      <HistoryPreviewSection
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
  readOnly,
  onOpenCheck,
}: {
  table: Table;
  profile: HistoryProfile;
  noun: EntityNoun;
  readOnly: boolean;
  onOpenCheck: (checkId: HistoryCheckId) => void;
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
            onOpen={() => onOpenCheck(check.id)}
          />
        ))}
      </DetailsTable>
    </SidebarSection>
  );
}

function getAlternativeBinding(
  history: HistoryBinding,
): Partial<HistoryBinding> | null {
  if (history.currentFlagFieldId != null) {
    return { currentFlagFieldId: null };
  }
  if (history.validToFieldId != null) {
    return { validToFieldId: null };
  }
  return null;
}

function CheckRow({
  table,
  check,
  profile,
  noun,
  readOnly,
  onOpen,
}: {
  table: Table;
  check: HistoryCheck;
  profile: HistoryProfile;
  noun: EntityNoun;
  readOnly: boolean;
  onOpen: () => void;
}) {
  const structure = useTableStructures().getTableStructure(table);
  const icon = CHECK_STATUS_ICON[check.status];
  const affectedCount = check.entityKeys.length;
  const listedKeys = check.entityKeys.slice(0, MAX_LISTED_ENTITIES);
  const isFailed = check.status === "failed";
  const offersRuleComparison =
    isFailed &&
    check.id === "one-current" &&
    getAlternativeBinding(structure.history) != null;

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
        {affectedCount > 0 && (
          <Group gap="xs">
            {listedKeys.map((entityKey) => (
              <EntityLink
                key={entityKey}
                entityKey={entityKey}
                profile={profile}
              />
            ))}
            <Button
              size="compact-sm"
              variant="subtle"
              rightSection={<Icon name="chevronright" size={12} />}
              onClick={onOpen}
              data-testid="open-history-check"
            >
              {affectedCount === 1
                ? t`View details`
                : t`View all ${countOf(affectedCount, noun)}`}
            </Button>
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
        {isFailed && !offersRuleComparison && (
          <Text size="sm" c="text-secondary">
            {t`This is in the data, not in these settings. Fix it where the table is built, or confirm with known issues so analysts see a note.`}
          </Text>
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
  const alternativeBinding = getAlternativeBinding(structure.history);
  const alternative = {
    ...structure,
    history: { ...structure.history, ...alternativeBinding },
  };
  const alternativeState = useHistoryProfile(table, alternative.history, {
    skip: alternativeBinding == null,
  });
  if (alternativeBinding == null || alternativeState.status !== "loaded") {
    return null;
  }
  const dropsValidTo =
    "validToFieldId" in alternativeBinding &&
    structure.history.validToFieldId != null;
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
            {dropsValidTo && (
              <Text size="sm" c="text-secondary">
                {t`${displayNameOf(fields, structure.history.validToFieldId)} won't be used. Each version ends where the next one starts.`}
              </Text>
            )}
          </Stack>
          <Button
            size="compact-sm"
            variant="filled"
            flex="0 0 auto"
            disabled={readOnly}
            onClick={() => setHistoryBinding(table, alternativeBinding)}
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

function displayNameOf(fields: Field[], fieldId: number | null) {
  return fields.find((field) => field.id === fieldId)?.display_name ?? "";
}

function CheckDetails({
  table,
  check,
  profile,
  noun,
  onBack,
}: {
  table: Table;
  check: HistoryCheck;
  profile: HistoryProfile;
  noun: EntityNoun;
  onBack: () => void;
}) {
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(0);
  const icon = CHECK_STATUS_ICON[check.status];
  const entitiesByKey = useMemo(
    () => new Map(profile.entities.map((entity) => [entity.key, entity])),
    [profile],
  );
  const query = searchText.trim().toLowerCase();
  const matchingEntities = check.entityKeys
    .map((entityKey) => entitiesByKey.get(entityKey))
    .filter(isNotNull)
    .filter(
      (entity) =>
        query === "" ||
        entity.key.toLowerCase().includes(query) ||
        (entity.label?.toLowerCase().includes(query) ?? false),
    );
  const pageEntities = matchingEntities.slice(
    page * CHECK_PAGE_SIZE,
    (page + 1) * CHECK_PAGE_SIZE,
  );

  return (
    <Stack gap="lg" data-testid="history-check-details">
      <Button
        variant="subtle"
        px={0}
        w="fit-content"
        leftSection={<Icon name="chevronleft" />}
        onClick={onBack}
      >
        {t`All checks`}
      </Button>
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <Icon name={icon.name} c={icon.color} mt={4} flex="0 0 auto" />
        <Stack gap={4} miw={0}>
          <Title order={4}>{getCheckTitle(check.id)}</Title>
          <Text size="sm" c="text-secondary">
            {getCheckDescription(check, profile, noun)}{" "}
            {getCheckScope(profile, table)}
          </Text>
        </Stack>
      </Group>
      <TextInput
        aria-label={t`Search ${noun.other}`}
        placeholder={t`Search ${noun.other}`}
        leftSection={<Icon name="search" />}
        value={searchText}
        onChange={(event) => {
          setSearchText(event.target.value);
          setPage(0);
        }}
      />
      {pageEntities.length > 0 ? (
        <DetailsTable>
          {pageEntities.map((entity) => (
            <AffectedEntityRow key={entity.key} entity={entity} />
          ))}
        </DetailsTable>
      ) : (
        <Text c="text-secondary">{t`No ${noun.other} match.`}</Text>
      )}
      <Group justify="flex-end">
        <PaginationControls
          page={page}
          pageSize={CHECK_PAGE_SIZE}
          itemsLength={pageEntities.length}
          total={matchingEntities.length}
          showTotal
          onNextPage={() => setPage(page + 1)}
          onPreviousPage={() => setPage(page - 1)}
        />
      </Group>
    </Stack>
  );
}

function AffectedEntityRow({ entity }: { entity: HistoryEntity }) {
  const { setSelectedEntityKey } = useHistoryEntitySelection();
  return (
    <UnstyledButton
      px="lg"
      py="md"
      w="100%"
      onClick={() => setSelectedEntityKey(entity.key)}
      data-testid="history-check-entity"
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
        <Stack gap={4} miw={0}>
          <Text fw="bold" truncate>
            {entity.label ? `${entity.label} · ${entity.key}` : entity.key}
          </Text>
          {entity.versions.map((version) => (
            <Group key={version.rowIndex} gap="xs" wrap="nowrap">
              <Text size="sm" c="text-secondary">
                {t`${formatDate(version.validFrom)} to ${formatDate(version.validTo)}`}
              </Text>
              {version.isCurrent && (
                <Badge color="brand" variant="light" size="sm">
                  {t`Current`}
                </Badge>
              )}
            </Group>
          ))}
        </Stack>
        <Icon name="chevronright" c="text-secondary" mt={4} flex="0 0 auto" />
      </Group>
    </UnstyledButton>
  );
}
