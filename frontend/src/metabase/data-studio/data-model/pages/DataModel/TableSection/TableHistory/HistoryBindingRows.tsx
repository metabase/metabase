import { t } from "ttag";
import _ from "underscore";

import {
  type HistoryBinding,
  type HistoryKind,
  type TableStructure,
  getHistoryKind,
  getHistoryKindOptions,
  getHistorySignalLabel,
  inferHistoryBinding,
  useHistoryReviewStatus,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Button, Group, Loader, Radio, Stack, Text } from "metabase/ui";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, Table } from "metabase-types/api";

import { InferredIcon, NeedsReviewBadge } from "../InferenceReview";

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

export function getValidToForDates(
  fields: Field[],
  binding: Pick<HistoryBinding, "validFromFieldId">,
): FieldId | null {
  const inferredFieldId = inferHistoryBinding(fields).validToFieldId;
  if (inferredFieldId != null) {
    return inferredFieldId;
  }
  const otherDateField = fields.find(
    (field) =>
      isDate(field) && getRawTableFieldId(field) !== binding.validFromFieldId,
  );
  return otherDateField ? getRawTableFieldId(otherDateField) : null;
}

function getInferenceDescription({
  scdType,
  scdTypeInference,
}: TableStructure) {
  const source = t`Recognized from ${getHistorySignalLabel(scdTypeInference.rule)}: ${scdTypeInference.signal}`;
  return scdType != null ? t`SCD type ${scdType} · ${source}` : source;
}

export function HistoryKindInput({
  structure,
  fields,
  disabled,
  onChange,
  onConfirmGuess,
}: {
  structure: TableStructure;
  fields: Field[];
  disabled: boolean;
  onChange: (kind: HistoryKind) => void;
  onConfirmGuess: () => void;
}) {
  const { scdTypeInference, isScdTypeOverridden } = structure;
  const isWeakGuess =
    !isScdTypeOverridden && scdTypeInference.confidence === "low";
  const selectedKind = getTableHistoryKind(structure);
  const hasDateRange = getValidToForDates(fields, structure.history) != null;

  return (
    <Stack gap="sm" py="xs">
      {isWeakGuess && (
        <Group gap="xs">
          <NeedsReviewBadge />
          {!disabled && (
            <Button size="compact-sm" variant="filled" onClick={onConfirmGuess}>
              {t`Confirm`}
            </Button>
          )}
        </Group>
      )}
      <Radio.Group
        value={selectedKind}
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
              label={
                <Group gap="xs" wrap="nowrap">
                  {option.label}
                  {option.value === selectedKind && !isScdTypeOverridden && (
                    <InferredIcon
                      description={getInferenceDescription(structure)}
                    />
                  )}
                </Group>
              }
              disabled={
                disabled ||
                (option.value === "versions-with-dates" && !hasDateRange)
              }
            />
          ))}
        </Stack>
      </Radio.Group>
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
