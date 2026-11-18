import { useMemo } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { Group, Icon, Select, SelectItem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { EventTableColumnRole, Field, Table } from "metabase-types/api";

import S from "../TableAttributes.module.css";

import { getColumnRoleFields, getColumnRoleValue } from "./utils";

type ColumnRoleInputProps = {
  table: Table;
  role: EventTableColumnRole;
  label: string;
  isRequired: boolean;
  disabled: boolean;
  onChange: (role: EventTableColumnRole, columnName: string | null) => void;
};

export function ColumnRoleInput({
  table,
  role,
  label,
  isRequired,
  disabled,
  onChange,
}: ColumnRoleInputProps) {
  const fieldsByName = useMemo(
    () =>
      new Map(
        getColumnRoleFields(table, role).map((field) => [field.name, field]),
      ),
    [table, role],
  );
  const options = useMemo(
    () =>
      Array.from(fieldsByName.values(), (field) => ({
        value: field.name,
        label: field.display_name,
      })),
    [fieldsByName],
  );
  const value = getColumnRoleValue(table, role);
  const selectedField = value != null ? fieldsByName.get(value) : undefined;

  return (
    <Select
      label={label}
      data={options}
      value={value}
      placeholder={isRequired ? t`Pick a column` : t`None`}
      clearable={!isRequired}
      allowDeselect={!isRequired}
      searchable
      disabled={disabled}
      comboboxProps={{
        middlewares: { flip: true, size: { padding: 6 } },
        position: "bottom-start",
      }}
      leftSection={
        selectedField != null ? <FieldIcon field={selectedField} /> : undefined
      }
      renderOption={(item) => {
        const field = fieldsByName.get(item.option.value);
        return (
          <SelectItem selected={item.option.value === value}>
            <Group align="center" gap="sm">
              {field != null && <FieldIcon field={field} />}
              <span>{item.option.label}</span>
            </Group>
          </SelectItem>
        );
      }}
      className={S.gridLabelInput}
      classNames={{ input: S.input, label: S.label }}
      onChange={(columnName) => onChange(role, columnName)}
    />
  );
}

const FieldIcon = ({ field }: { field: Field }) => (
  <Icon name={getColumnIcon(Lib.legacyColumnTypeInfo(field))} />
);
