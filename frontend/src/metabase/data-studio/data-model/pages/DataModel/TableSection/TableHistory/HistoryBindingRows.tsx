import { t } from "ttag";
import _ from "underscore";

import {
  type HistoryBinding,
  type TableStructure,
  inferHistoryBinding,
  useHistoryReviewStatus,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Loader, Stack, Text } from "metabase/ui";
import { isDate } from "metabase-lib/v1/types/utils/isa";
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
