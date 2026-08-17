import { match } from "ts-pattern";

import {
  FormNumberInput,
  FormSelect,
  FormSwitch,
  FormTextInput,
} from "metabase/forms";
import type { ComboboxItem } from "metabase/ui";
import type { IndexField } from "metabase-types/api";

import { ColumnsField } from "./ColumnsField";

type IndexFieldInputProps = {
  field: IndexField;
  columnOptions: ComboboxItem[];
  disabled?: boolean;
  autoFocus?: boolean;
};

export function IndexFieldInput({
  field,
  columnOptions,
  disabled,
  autoFocus,
}: IndexFieldInputProps) {
  const label = field["display-name"];
  const description = field.description;

  return match(field.type)
    .with("boolean", () => {
      // Per design, the unique switch renders its description as the inline label
      const isUniqueField = field.name === "unique";
      return (
        <FormSwitch
          name={field.name}
          label={isUniqueField ? (description ?? label) : label}
          description={isUniqueField ? undefined : description}
          disabled={disabled}
          size="sm"
        />
      );
    })
    .with("select", () => (
      <FormSelect
        name={field.name}
        label={label}
        description={description}
        data={(field.options ?? []).map((option) => ({
          value: option.value,
          label: option.name,
        }))}
        disabled={disabled}
      />
    ))
    .with("integer", () => (
      <FormNumberInput
        name={field.name}
        label={label}
        description={description}
        disabled={disabled}
      />
    ))
    .with("columns", () => (
      <ColumnsField
        name={field.name}
        label={label}
        description={description}
        options={columnOptions}
        supportsDirections={field.directions ?? false}
        disabled={disabled}
      />
    ))
    .otherwise(() => (
      <FormTextInput
        name={field.name}
        label={label}
        description={description}
        disabled={disabled}
        autoFocus={autoFocus}
        data-autofocus={autoFocus}
        autoComplete="off"
      />
    ));
}
