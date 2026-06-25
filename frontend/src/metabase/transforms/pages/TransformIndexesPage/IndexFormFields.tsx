import {
  FormNumberInput,
  FormSelect,
  FormSwitch,
  FormTextInput,
} from "metabase/forms";
import type { ComboboxItem } from "metabase/ui";
import type { IndexField } from "metabase-types/api";

import { IndexColumnsField } from "./IndexColumnsField";

type IndexFormFieldsProps = {
  fields: IndexField[];
  columnOptions: ComboboxItem[];
  isLoadingColumns: boolean;
  disabledFieldNames?: string[];
};

export function IndexFormFields({
  fields,
  columnOptions,
  isLoadingColumns,
  disabledFieldNames = [],
}: IndexFormFieldsProps) {
  return (
    <>
      {fields.map((field) => (
        <IndexFieldInput
          key={field.name}
          field={field}
          columnOptions={columnOptions}
          isLoadingColumns={isLoadingColumns}
          disabled={disabledFieldNames.includes(field.name)}
        />
      ))}
    </>
  );
}

type IndexFieldInputProps = {
  field: IndexField;
  columnOptions: ComboboxItem[];
  isLoadingColumns: boolean;
  disabled: boolean;
};

function IndexFieldInput({
  field,
  columnOptions,
  isLoadingColumns,
  disabled,
}: IndexFieldInputProps) {
  const label = field["display-name"];

  switch (field.type) {
    case "boolean":
      return <FormSwitch name={field.name} label={label} disabled={disabled} />;
    case "integer":
      return (
        <FormNumberInput name={field.name} label={label} disabled={disabled} />
      );
    case "select":
      return (
        <FormSelect
          name={field.name}
          label={label}
          disabled={disabled}
          data={(field.options ?? []).map((option) => ({
            value: option.value,
            label: option.name,
          }))}
        />
      );
    case "columns":
      return (
        <IndexColumnsField
          field={field}
          columnOptions={columnOptions}
          disabled={disabled || isLoadingColumns}
        />
      );
    case "string":
      return (
        <FormTextInput name={field.name} label={label} disabled={disabled} />
      );
  }
}
