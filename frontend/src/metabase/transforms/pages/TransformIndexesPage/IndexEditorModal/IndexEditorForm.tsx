import { useFormikContext } from "formik";
import { t } from "ttag";

import { Form, FormSubmitButton } from "metabase/forms";
import {
  Button,
  type ComboboxItem,
  Group,
  Select,
  SelectItemWithDescription,
  Stack,
} from "metabase/ui";
import type { IndexField, IndexKind } from "metabase-types/api";

import { IndexFieldInput } from "./IndexFieldInput";
import { getIndexTypeDescription } from "./constants";
import type { IndexKindOption } from "./types";
import type { IndexFormValues } from "./utils";

type IndexEditorFormProps = {
  kind: IndexKind;
  kindOptions: IndexKindOption[];
  fields: IndexField[];
  columnOptions: ComboboxItem[];
  isEditing: boolean;
  submitLabel: string;
  onKindChange: (kind: IndexKind, currentValues: IndexFormValues) => void;
  onClose: () => void;
};

export function IndexEditorForm({
  kind,
  kindOptions,
  fields,
  columnOptions,
  isEditing,
  submitLabel,
  onKindChange,
  onClose,
}: IndexEditorFormProps) {
  const { values } = useFormikContext<IndexFormValues>();
  // The order of fields in the form is driven by the BE schema
  const [firstField, ...restFields] = fields;

  return (
    <Form>
      <Stack gap="lg" mt="sm">
        {firstField && (
          <IndexFieldInput
            key={firstField.name}
            field={firstField}
            columnOptions={columnOptions}
            disabled={isEditing && firstField.name === "name"}
            autoFocus={!isEditing}
          />
        )}

        <Select
          label={t`Index type`}
          description={getIndexTypeDescription()}
          data={kindOptions}
          value={kind}
          onChange={(value) => value && onKindChange(value, values)}
          disabled={isEditing}
          allowDeselect={false}
          renderOption={({ option }) => {
            const description = kindOptions.find(
              (kindOption) => kindOption.value === option.value,
            )?.description;
            return (
              <SelectItemWithDescription
                selected={option.value === kind}
                showCheckIcon={false}
                label={option.label}
                description={description}
              />
            );
          }}
        />

        {restFields.map((field) => (
          <IndexFieldInput
            key={field.name}
            field={field}
            columnOptions={columnOptions}
            disabled={isEditing && field.name === "name"}
          />
        ))}

        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
          <FormSubmitButton label={submitLabel} variant="filled" />
        </Group>
      </Stack>
    </Form>
  );
}
