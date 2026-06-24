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
};

export function IndexFormFields({
  fields,
  columnOptions,
  isLoadingColumns,
}: IndexFormFieldsProps) {
  return (
    <>
      {fields.map((field) => (
        <IndexFieldInput
          key={field.name}
          field={field}
          columnOptions={columnOptions}
          isLoadingColumns={isLoadingColumns}
        />
      ))}
    </>
  );
}

type IndexFieldInputProps = {
  field: IndexField;
  columnOptions: ComboboxItem[];
  isLoadingColumns: boolean;
};

function IndexFieldInput({
  field,
  columnOptions,
  isLoadingColumns,
}: IndexFieldInputProps) {
  const label = field["display-name"];

  switch (field.type) {
    case "boolean":
      return <FormSwitch name={field.name} label={label} />;
    case "integer":
      return <FormNumberInput name={field.name} label={label} />;
    case "select":
      return (
        <FormSelect
          name={field.name}
          label={label}
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
          disabled={isLoadingColumns}
        />
      );
    case "string":
      return <FormTextInput name={field.name} label={label} />;
  }
}
