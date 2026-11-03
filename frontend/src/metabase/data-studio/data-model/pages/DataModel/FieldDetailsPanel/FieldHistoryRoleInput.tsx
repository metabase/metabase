import { t } from "ttag";
import _ from "underscore";

import {
  type HistoryBinding,
  getAttributeScdTypeDescription,
  isRoleA,
  useHistoryReview,
  useHistoryReviewStatus,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Code, Group, Select, Stack, Text } from "metabase/ui";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { Field, Table } from "metabase-types/api";

import { AttributeScdTypeSelect } from "../TableSection/TableHistory/HistoryColumnsSection";

const HISTORY_FIELD_ROLES = [
  "durableKeyFieldId",
  "validFromFieldId",
  "validToFieldId",
  "currentFlagFieldId",
  "versionFieldId",
] as const;

type HistoryFieldRole = (typeof HISTORY_FIELD_ROLES)[number];

const NO_ROLE = "none";

const SEMANTIC_TYPE_BY_ROLE: Record<HistoryFieldRole, string> = {
  durableKeyFieldId: "key: DurableKey",
  validFromFieldId: "time: ValidFrom",
  validToFieldId: "time: ValidTo",
  currentFlagFieldId: "lifecycle: CurrentRowFlag",
  versionFieldId: "type/Version",
};

function getHistoryFieldRoleOptions(): {
  value: HistoryFieldRole | typeof NO_ROLE;
  label: string;
}[] {
  return [
    { value: NO_ROLE, label: t`An attribute of the entity` },
    { value: "durableKeyFieldId", label: t`Durable key` },
    { value: "validFromFieldId", label: t`Valid from` },
    { value: "validToFieldId", label: t`Valid to` },
    { value: "currentFlagFieldId", label: t`Current flag` },
    { value: "versionFieldId", label: t`Version` },
  ];
}

const isHistoryFieldRole = (value: unknown): value is HistoryFieldRole =>
  HISTORY_FIELD_ROLES.some((role) => role === value);

export function useIsHistoryTable(table: Table) {
  const { role } = useTableStructures().getTableStructure(table);
  return role != null && isRoleA(role, "role/HistoryDimension");
}

export function FieldHistoryRoleInput({
  field,
  table,
  disabled,
}: {
  field: Field;
  table: Table;
  disabled: boolean;
}) {
  const { getTableStructure, setHistoryBinding } = useTableStructures();
  const binding = getTableStructure(table).history;
  const fieldId = getRawTableFieldId(field);
  const currentRole =
    HISTORY_FIELD_ROLES.find((role) => binding[role] === fieldId) ?? NO_ROLE;

  const handleChange = (value: string | null) => {
    const cleared = Object.fromEntries(
      HISTORY_FIELD_ROLES.filter((role) => binding[role] === fieldId).map(
        (role) => [role, null],
      ),
    );
    const assigned = isHistoryFieldRole(value) ? { [value]: fieldId } : {};
    const update: Partial<HistoryBinding> = { ...cleared, ...assigned };
    if (!_.isEmpty(update)) {
      setHistoryBinding(table, update);
    }
  };

  return (
    <Stack gap="xs" py="xs">
      <Select
        aria-label={t`Role in the history`}
        data={getHistoryFieldRoleOptions()}
        value={currentRole}
        allowDeselect={false}
        disabled={disabled}
        onChange={handleChange}
        data-testid="field-history-role-select"
      />
      {currentRole !== NO_ROLE ? (
        <Group gap="xs">
          <Text size="sm" c="text-secondary">{t`Semantic type`}</Text>
          <Code>{SEMANTIC_TYPE_BY_ROLE[currentRole]}</Code>
        </Group>
      ) : (
        <Text size="sm" c="text-secondary">
          {t`Same binding as the table's History section.`}
        </Text>
      )}
    </Stack>
  );
}

export function FieldAttributeScdTypeInput({
  field,
  table,
  disabled,
}: {
  field: Field;
  table: Table;
  disabled: boolean;
}) {
  const status = useHistoryReviewStatus(table);
  const { getAttributeScdType, setAttributeScdType } = useHistoryReview(table);
  const profile =
    status?.profileState.status === "loaded"
      ? status.profileState.profile
      : undefined;
  const column = profile?.columns.find(
    (column) => column.field.name === field.name,
  );
  const { attributeScdType, isOverridden, suggestion } = getAttributeScdType(
    field,
    column,
    profile?.entityCount ?? 0,
  );
  const changeSummary = column
    ? t`Changed ${column.changeCount.toLocaleString()} times across ${column.changedEntityCount.toLocaleString()} keys`
    : null;

  return (
    <Stack gap="xs" py="xs">
      <AttributeScdTypeSelect
        label={t`Attribute SCD type`}
        value={attributeScdType}
        disabled={disabled}
        onChange={(value) =>
          setAttributeScdType(getRawTableFieldId(field), value)
        }
      />
      <Text size="sm" c="text-secondary">
        {isOverridden
          ? t`Set by an admin. ${getAttributeScdTypeDescription(attributeScdType)}.`
          : t`Not set. Suggests type ${suggestion.attributeScdType}: ${suggestion.reason}.`}
        {changeSummary && ` ${changeSummary}.`}
      </Text>
    </Stack>
  );
}

export function useIsHistoryAttribute(field: Field, table: Table) {
  const binding = useTableStructures().getTableStructure(table).history;
  const fieldId = getRawTableFieldId(field);
  const isBound = HISTORY_FIELD_ROLES.some((role) => binding[role] === fieldId);
  return !isBound && !isPK(field);
}
