import { t } from "ttag";
import _ from "underscore";

import {
  type HistoryBinding,
  type HistoryKind,
  type TableStructure,
  getHistoryKind,
  getHistoryKindOptions,
  getHistorySignalLabel,
  useHistoryReviewStatus,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Badge, Button, Loader, Radio, Stack, Text } from "metabase/ui";
import type { Field, FieldId, Table } from "metabase-types/api";

import { countOf, getEntityNoun } from "./history-labels";

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
  return (
    <Text>
      {t`${countOf(profile.entityCount, noun)} · ${profile.rowCount.toLocaleString()} records`}
    </Text>
  );
}
