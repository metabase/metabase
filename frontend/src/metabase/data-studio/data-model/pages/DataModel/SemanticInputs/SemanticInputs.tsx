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
  onChange: (value: string | null) => void;
};

export function SemanticTypeSelect({
  field,
  value,
  onChange,
  ...props
}: SemanticTypeSelectProps) {
  const options = [
    {
      group: t`None`,
      items: [{ value: NO_TYPE, label: t`No semantic type` }],
    },
    ...getFieldTypeOptions(field, value),
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
      onOptionSubmit={(nextValue) =>
        onChange(nextValue === NO_TYPE ? null : nextValue)
      }
      {...props}
    />
  );
}

type SubjectSelectProps = InputProps & {
  value: TableSubject | null;
  onChange: (value: TableSubject) => void;
};

export function SubjectSelect({
  value,
  onChange,
  ...props
}: SubjectSelectProps) {
  return (
    <Select
      aria-label={t`Subject`}
      data={getTableSubjectOptions()}
      value={value ?? NO_SUBJECT}
      searchable
      allowDeselect={false}
      leftSection={<Icon name={getTableSubjectIcon(value)} />}
      renderOption={renderIconOption(getSubjectOptionIcon)}
      onOptionSubmit={(nextValue) => {
        if (isTableSubject(nextValue)) {
          onChange(nextValue);
        }
      }}
      {...props}
    />
  );
}
