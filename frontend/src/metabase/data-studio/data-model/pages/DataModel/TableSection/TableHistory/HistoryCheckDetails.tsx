import cx from "classnames";
import { useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { SidebarSection } from "metabase/common/components/DetailSidebar";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import {
  type HistoryBinding,
  type HistoryCheck,
  type HistoryEntity,
  type HistoryProfile,
  useHistoryProfile,
  useTableStructures,
} from "metabase/metadata/table-structure";
import {
  Badge,
  Button,
  Card,
  Group,
  Icon,
  Paper,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
  rem,
} from "metabase/ui";
import { isNotNull } from "metabase/utils/types";
import type { Field, Table } from "metabase-types/api";

import { useHistoryEntitySelection } from "../../contexts/HistoryEntitySelectionContext";

import { describeCurrentRule } from "./HistoryBindingRows";
import S from "./HistoryChecks.module.css";
import {
  type EntityNoun,
  countOf,
  getCheckDescription,
  getCheckScope,
  getEntityNoun,
} from "./history-labels";

const CHECK_PAGE_SIZE = 10;

export function HistoryCheckDetails({
  table,
  check,
  profile,
  readOnly,
}: {
  table: Table;
  check: HistoryCheck;
  profile: HistoryProfile;
  readOnly: boolean;
}) {
  const structure = useTableStructures().getTableStructure(table);
  const noun = getEntityNoun(profile.durableKeyField);
  const isFailed = check.status === "failed";
  const offersRuleComparison =
    isFailed &&
    check.id === "one-current" &&
    getAlternativeBinding(structure.history) != null;

  return (
    <Stack gap="xxl">
      <Stack gap="sm">
        <Text>{getCheckDescription(check, profile, noun)}</Text>
        <Text size="sm" c="text-secondary">
          {getCheckScope(profile, table)}
        </Text>
      </Stack>
      {offersRuleComparison && (
        <SidebarSection title={t`Fix`}>
          <CurrentRuleComparison
            table={table}
            check={check}
            profile={profile}
            noun={noun}
            readOnly={readOnly}
          />
        </SidebarSection>
      )}
      {isFailed && !offersRuleComparison && (
        <SidebarSection title={t`Fix`}>
          <Text size="sm" c="text-secondary">
            {t`This is in the data, not in these settings. Fix it where the table is built, or confirm with known issues so analysts see a note.`}
          </Text>
        </SidebarSection>
      )}
      {check.entityKeys.length > 0 && (
        <SidebarSection title={t`Affected ${noun.other}`}>
          <AffectedEntityList check={check} profile={profile} noun={noun} />
        </SidebarSection>
      )}
    </Stack>
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

function displayNameOf(fields: Field[], fieldId: number | null) {
  return fields.find((field) => field.id === fieldId)?.display_name ?? "";
}

function AffectedEntityList({
  check,
  profile,
  noun,
}: {
  check: HistoryCheck;
  profile: HistoryProfile;
  noun: EntityNoun;
}) {
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(0);
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
    <Stack gap="md" data-testid="history-check-entities">
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
        <Stack gap={rem(12)} role="list">
          {pageEntities.map((entity) => (
            <AffectedEntityRow key={entity.key} entity={entity} />
          ))}
        </Stack>
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
  const { selectedEntityKey, setSelectedEntityKey } =
    useHistoryEntitySelection();
  const isActive = selectedEntityKey === entity.key;
  const currentCount = entity.versions.filter(
    (version) => version.isCurrent,
  ).length;
  return (
    <Card
      className={cx(S.card, { [S.active]: isActive })}
      bg={
        isActive ? "background_surface-brand-subtle" : "background_page-primary"
      }
      role="listitem"
      p={0}
      pb={1}
      withBorder
      data-testid="history-check-entity"
    >
      <UnstyledButton
        className={S.button}
        aria-label={entity.label ?? entity.key}
        px="lg"
        py={rem(12)}
        w="100%"
        onClick={() => setSelectedEntityKey(entity.key)}
      >
        <Group gap="sm" wrap="nowrap">
          <Stack gap={2} miw={0} flex={1}>
            <Text fw="bold" lineClamp={1}>
              {entity.label ? `${entity.label} · ${entity.key}` : entity.key}
            </Text>
            <Text size="sm" c="text-secondary" lineClamp={1}>
              {t`${countOfVersions(entity.versions.length)}, ${currentCount} current`}
            </Text>
          </Stack>
          <Icon name="chevronright" c="text-secondary" flex="0 0 auto" />
        </Group>
      </UnstyledButton>
    </Card>
  );
}

const countOfVersions = (count: number) =>
  ngettext(msgid`${count} version`, `${count} versions`, count);
