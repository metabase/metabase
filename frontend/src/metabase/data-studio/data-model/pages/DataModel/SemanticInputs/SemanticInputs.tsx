import { t } from "ttag";

import {
  NO_SUBJECT,
  type TableSubject,
  getFieldTypeIcon,
  getFieldTypeOptions,
  getTableSubjectIcon,
  getTableSubjectOptions,
  isTableSubject,
} from "metabase/metadata/semantic-types";
import { Group, Icon, Select, SelectItem, type SelectProps } from "metabase/ui";
import type { Field, IconName } from "metabase-types/api";

const NO_TYPE = "none";

type InputProps = Pick<SelectProps, "classNames" | "disabled" | "size" | "w">;

function markInferred<T extends { value: string; label: string }>(
  groups: { group: string; items: T[] }[],
  inferredValue: string | null,
): { group: string; items: T[] }[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.value === inferredValue
        ? { ...item, label: t`${item.label} (Inferred)` }
        : item,
    ),
  }));
}

function renderIconOption(getIcon: (value: string) => IconName) {
  return function IconOption({
    option,
    checked,
  }: {
    option: { value: string; label: string };
    checked?: boolean;
  }) {
    return (
      <SelectItem selected={checked}>
        <Group gap="sm" wrap="nowrap">
          <Icon name={getIcon(option.value)} />
          <span>{option.label}</span>
        </Group>
      </SelectItem>
    );
  };
}

const getTypeOptionIcon = (value: string) =>
  getFieldTypeIcon(value === NO_TYPE ? null : value);

const getSubjectOptionIcon = (value: string) =>
  getTableSubjectIcon(isTableSubject(value) ? value : null);

type SemanticTypeSelectProps = InputProps & {
  field: Pick<Field, "base_type" | "effective_type">;
  value: string | null;
  markedValue?: string | null;
  onChange: (value: string | null) => void;
};

export function SemanticTypeSelect({
  field,
  value,
  markedValue = null,
  onChange,
  ...props
}: SemanticTypeSelectProps) {
  const options = [
    {
      group: t`None`,
      items: [{ value: NO_TYPE, label: t`No semantic type` }],
    },
    ...markInferred(getFieldTypeOptions(field, value), markedValue),
  ];

  return (
    <Select
      aria-label={t`Semantic type`}
      data={options}
      value={value ?? NO_TYPE}
      searchable
      allowDeselect={false}
      leftSection={<Icon name={getFieldTypeIcon(value)} />}
      renderOption={renderIconOption(getTypeOptionIcon)}
      onChange={(nextValue) =>
        onChange(nextValue === NO_TYPE ? null : nextValue)
      }
      {...props}
    />
  );
}

type SubjectSelectProps = InputProps & {
  value: TableSubject | null;
  markedValue?: TableSubject | null;
  onChange: (value: TableSubject) => void;
};

export function SubjectSelect({
  value,
  markedValue = null,
  onChange,
  ...props
}: SubjectSelectProps) {
  return (
    <Select
      aria-label={t`Subject`}
      data={markInferred(getTableSubjectOptions(), markedValue)}
      value={value ?? NO_SUBJECT}
      searchable
      allowDeselect={false}
      leftSection={<Icon name={getTableSubjectIcon(value)} />}
      renderOption={renderIconOption(getSubjectOptionIcon)}
      onChange={(nextValue) => {
        if (isTableSubject(nextValue)) {
          onChange(nextValue);
        }
      }}
      {...props}
    />
  );
}
