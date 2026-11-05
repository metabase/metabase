import { t } from "ttag";
import _ from "underscore";

import { Link } from "metabase/common/components/Link";
import {
  type CurrentRule,
  type HistoryBinding,
  type HistoryKind,
  type TableStructure,
  countsDurableKeys,
  getHistoryKind,
  getHistoryKindOptions,
  getHistorySignalLabel,
  useHistoryReview,
  useHistoryReviewStatus,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Badge, Button, Group, Loader, Radio, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Field, FieldId, Table } from "metabase-types/api";

import { countOf, getCheckDescription, getEntityNoun } from "./history-labels";

type PointerKey = keyof Omit<HistoryBinding, "currentRowsOnly">;

function getPointerLabels(): Record<PointerKey, string> {
  return {
    durableKeyFieldId: t`Entity key`,
    validFromFieldId: t`Valid from`,
    validToFieldId: t`Valid to`,
    currentFlagFieldId: t`Current flag`,
    versionFieldId: t`Version`,
  };
}

const POINTER_KEYS: PointerKey[] = [
  "durableKeyFieldId",
  "validFromFieldId",
  "validToFieldId",
  "currentFlagFieldId",
  "versionFieldId",
];

const findField = (fields: Field[], fieldId: FieldId | null) =>
  fields.find((field) => getRawTableFieldId(field) === fieldId);

const displayNameOf = (fields: Field[], fieldId: FieldId | null) =>
  findField(fields, fieldId)?.display_name ?? t`a column`;

export function getCurrentRule(
  structure: Pick<TableStructure, "history">,
): CurrentRule {
  if (structure.history.currentFlagFieldId != null) {
    return "current-flag";
  }
  return structure.history.validToFieldId != null
    ? "valid-to-is-null"
    : "latest-per-key";
}

export function describeCurrentRule(
  structure: Pick<TableStructure, "history">,
  fields: Field[],
) {
  const {
    currentFlagFieldId,
    validToFieldId,
    durableKeyFieldId,
    validFromFieldId,
  } = structure.history;
  switch (getCurrentRule(structure)) {
    case "current-flag":
      return t`where ${displayNameOf(fields, currentFlagFieldId)} is true`;
    case "valid-to-is-null":
      return t`where ${displayNameOf(fields, validToFieldId)} is empty`;
    case "latest-per-key":
      return t`the latest row per ${displayNameOf(fields, durableKeyFieldId)}, by ${displayNameOf(fields, validFromFieldId)}`;
  }
}

export function getTableHistoryKind(structure: TableStructure) {
  return getHistoryKind(structure.history.validToFieldId != null);
}

export function HistoryIntro({ structure }: { structure: TableStructure }) {
  const intros: Record<HistoryKind, string> = {
    "versions-with-dates": t`Each row is one version of an entity. Counting rows counts versions, so counts use distinct entity keys.`,
    "latest-row-per-key": t`Each row is one version of an entity, and the newest row per key is the current one. Counts use distinct entity keys.`,
  };
  return (
    <Text size="sm" c="text-secondary">
      {intros[getTableHistoryKind(structure)]}
    </Text>
  );
}

export function HistoryKindInput({
  structure,
  disabled,
  onChange,
  onConfirmGuess,
}: {
  structure: TableStructure;
  disabled: boolean;
  onChange: (kind: HistoryKind) => void;
  onConfirmGuess: () => void;
}) {
  const { scdTypeInference, isScdTypeOverridden } = structure;
  const isWeakGuess =
    !isScdTypeOverridden && scdTypeInference.confidence === "low";

  return (
    <Stack gap="sm" py="xs">
      {isWeakGuess && (
        <Badge color="warning" variant="light" w="fit-content">
          {t`Needs review`}
        </Badge>
      )}
      <Radio.Group
        value={getTableHistoryKind(structure)}
        onChange={(value) => {
          const option = getHistoryKindOptions().find(
            (option) => option.value === value,
          );
          if (option) {
            onChange(option.value);
          }
        }}
        aria-label={t`History`}
      >
        <Stack gap="sm">
          {getHistoryKindOptions().map((option) => (
            <Radio
              key={option.value}
              value={option.value}
              label={option.label}
              description={option.description}
              disabled={disabled}
            />
          ))}
        </Stack>
      </Radio.Group>
      <Text size="sm" c="text-secondary">
        {isScdTypeOverridden
          ? t`Set by an admin`
          : t`Recognized from ${getHistorySignalLabel(scdTypeInference.rule)}: ${scdTypeInference.signal}`}
      </Text>
      {!disabled && isWeakGuess && (
        <Button
          size="compact-sm"
          variant="subtle"
          w="fit-content"
          px={0}
          onClick={onConfirmGuess}
        >
          {t`Yes, that's right`}
        </Button>
      )}
    </Stack>
  );
}

export function CurrentRuleHint({
  table,
  structure,
  fields,
}: {
  table: Table;
  structure: TableStructure;
  fields: Field[];
}) {
  const { isConfirmed } = useHistoryReview(table);
  const description = describeCurrentRule(structure, fields);
  if (getCurrentRule(structure) !== "latest-per-key") {
    return (
      <Text size="sm" c="text-secondary">
        {t`Current version: ${description}.`}
      </Text>
    );
  }
  return (
    <Stack gap={4}>
      <Group gap="xs" wrap="nowrap" align="flex-start">
        {!isConfirmed(structure) && (
          <Badge color="warning" variant="light" flex="0 0 auto">
            {t`Proposed`}
          </Badge>
        )}
        <Text size="sm" c="text-secondary">
          {t`Current version: ${description}.`}
        </Text>
      </Group>
      <Text size="sm" c="text-secondary">
        {t`If two rows share the latest time, which one is current still needs a decision.`}
      </Text>
    </Stack>
  );
}

export function getSharedPointers(structure: TableStructure) {
  const labels = getPointerLabels();
  const bound = POINTER_KEYS.flatMap((key) => {
    const fieldId = structure.history[key];
    return fieldId != null ? [{ fieldId, label: labels[key] }] : [];
  });
  return Object.values(
    _.groupBy(bound, (pointer) => String(pointer.fieldId)),
  ).filter((group) => group.length > 1);
}

export function SharedPointerNote({
  structure,
  fields,
}: {
  structure: TableStructure;
  fields: Field[];
}) {
  const shared = getSharedPointers(structure);
  if (shared.length === 0) {
    return null;
  }
  return (
    <Stack gap={4} px="lg" pb="sm">
      {shared.map((group) => (
        <Text key={group[0].fieldId} size="sm" c="text-secondary">
          {t`${displayNameOf(fields, group[0].fieldId)} is used as both ${group.map((pointer) => pointer.label).join(" and ")}.`}
        </Text>
      ))}
    </Stack>
  );
}

export function HistoryVersionsSummary({ table }: { table: Table }) {
  const status = useHistoryReviewStatus(table);
  const { scdType } = useTableStructures().getTableStructure(table);
  const versionsUrl = Urls.dataStudioData({
    databaseId: table.db_id,
    schemaName: table.schema,
    tableId: table.id,
    tab: "versions",
  });

  if (status == null) {
    return null;
  }
  const { profileState } = status;
  if (profileState.status === "unbound") {
    return (
      <Text c="text-secondary">{t`Pick the entity key and valid from columns`}</Text>
    );
  }
  if (profileState.status !== "loaded") {
    return <Loader size="xs" />;
  }

  const { profile } = profileState;
  const noun = getEntityNoun(profile.durableKeyField);
  const durableKeyCheck = profile.checks.find(
    (check) => check.id === "durable-key",
  );

  return (
    <Stack gap="xs" py="xs">
      <Text c="text-primary" fw="bold">
        {t`${countOf(profile.entityCount, noun)} · ${profile.rowCount.toLocaleString()} records`}
      </Text>
      {durableKeyCheck?.status === "failed" && (
        <Text size="sm" c="feedback-negative">
          {getCheckDescription(durableKeyCheck, profile, noun)}
        </Text>
      )}
      <Text size="sm" c="text-secondary">
        {countsDurableKeys(scdType)
          ? t`Counting ${noun.other} counts each one once, not every record.`
          : t`Counts stay plain row counts.`}
      </Text>
      <Button
        component={Link}
        to={versionsUrl}
        size="compact-sm"
        variant="subtle"
        w="fit-content"
        px={0}
      >
        {t`Review versions`}
      </Button>
    </Stack>
  );
}
