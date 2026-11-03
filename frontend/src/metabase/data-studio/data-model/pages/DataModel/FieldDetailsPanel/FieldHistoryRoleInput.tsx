import { t } from "ttag";
import _ from "underscore";

import {
  type HistoryBinding,
  isRoleA,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Select, Stack, Text } from "metabase/ui";
import type { Field, Table } from "metabase-types/api";

const HISTORY_FIELD_ROLES = [
  "durableKeyFieldId",
  "versionKeyFieldId",
  "validFromFieldId",
  "validToFieldId",
  "currentFlagFieldId",
] as const;

type HistoryFieldRole = (typeof HISTORY_FIELD_ROLES)[number];

const NO_ROLE = "none";

function getHistoryFieldRoleOptions(): {
  value: HistoryFieldRole | typeof NO_ROLE;
  label: string;
}[] {
  return [
    { value: NO_ROLE, label: t`Not part of the history binding` },
    { value: "durableKeyFieldId", label: t`Durable key` },
    { value: "versionKeyFieldId", label: t`Version key` },
    { value: "validFromFieldId", label: t`Valid from` },
    { value: "validToFieldId", label: t`Valid to` },
    { value: "currentFlagFieldId", label: t`Current row flag` },
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
    const update: Partial<HistoryBinding> = {
      ...cleared,
      ...assigned,
      ...(value === "currentFlagFieldId"
        ? { currentRowRule: "flag" as const }
        : {}),
    };
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
      <Text size="sm" c="text-secondary">
        {t`How this column helps read versions. The same binding is in the table's History section.`}
      </Text>
    </Stack>
  );
}
