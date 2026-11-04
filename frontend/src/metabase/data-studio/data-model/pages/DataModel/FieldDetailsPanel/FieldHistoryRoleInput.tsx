import { t } from "ttag";
import _ from "underscore";

import {
  type HistoryBinding,
  isRoleA,
  useHistoryReview,
  useHistoryReviewStatus,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Checkbox, Select, Stack, Text } from "metabase/ui";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { Field, Table } from "metabase-types/api";

const HISTORY_FIELD_ROLES = [
  "durableKeyFieldId",
  "validFromFieldId",
  "validToFieldId",
  "currentFlagFieldId",
  "versionFieldId",
] as const;

type HistoryFieldRole = (typeof HISTORY_FIELD_ROLES)[number];

const NO_ROLE = "none";

function getHistoryFieldRoleOptions(): {
  value: HistoryFieldRole | typeof NO_ROLE;
  label: string;
}[] {
  return [
    { value: NO_ROLE, label: t`An attribute` },
    { value: "durableKeyFieldId", label: t`Entity key` },
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
  const roles = HISTORY_FIELD_ROLES.filter((role) => binding[role] === fieldId);
  const labels = getHistoryFieldRoleOptions();
  const labelOf = (role: HistoryFieldRole) =>
    labels.find((option) => option.value === role)?.label ?? role;

  const handleChange = (value: string | null) => {
    const cleared = Object.fromEntries(roles.map((role) => [role, null]));
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
        data={labels}
        value={roles[0] ?? NO_ROLE}
        allowDeselect={false}
        disabled={disabled}
        onChange={handleChange}
        data-testid="field-history-role-select"
      />
      <Text size="sm" c="text-secondary">
        {roles.length > 1
          ? t`Used as both ${roles.map(labelOf).join(" and ")}.`
          : t`Same setting as the table's History section.`}
      </Text>
    </Stack>
  );
}

function CorrectionCheckbox({
  fieldName,
  checked,
  disabled,
  onChange,
}: {
  fieldName: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox
      label={t`Changes are corrections — always show the latest value`}
      aria-label={t`Changes to ${fieldName} are corrections`}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

export function FieldCorrectionInput({
  field,
  table,
  disabled,
}: {
  field: Field;
  table: Table;
  disabled: boolean;
}) {
  const status = useHistoryReviewStatus(table);
  const { isCorrectionField, setCorrectionField } = useHistoryReview(table);
  const profile =
    status?.profileState.status === "loaded"
      ? status.profileState.profile
      : undefined;
  const column = profile?.columns.find(
    (column) => column.field.name === field.name,
  );

  return (
    <Stack gap="xs" py="xs">
      <CorrectionCheckbox
        fieldName={field.display_name}
        checked={isCorrectionField(field)}
        disabled={disabled}
        onChange={(isCorrection) =>
          setCorrectionField(getRawTableFieldId(field), isCorrection)
        }
      />
      {column && (
        <Text size="sm" c="text-secondary">
          {column.changeCount > 0
            ? t`Changed ${column.changeCount.toLocaleString()} times across ${column.changedEntityCount.toLocaleString()} keys in the checked rows.`
            : t`Never changed in the checked rows.`}
        </Text>
      )}
    </Stack>
  );
}

export function useIsHistoryAttribute(field: Field, table: Table) {
  const binding = useTableStructures().getTableStructure(table).history;
  const fieldId = getRawTableFieldId(field);
  const isBound = HISTORY_FIELD_ROLES.some((role) => binding[role] === fieldId);
  return !isBound && !isPK(field);
}
