import { t } from "ttag";

import { Form, FormErrorMessage, FormSubmitButton } from "metabase/forms";
import { Box, Button, Group, Select, Stack, Text } from "metabase/ui";
import type { IndexField, IndexKind } from "metabase-types/api";

import { IndexFieldInput } from "./IndexFieldInput";
import { getIndexTypeDescription, getKindDescription } from "./constants";
import type { ColumnOption } from "./types";

type IndexEditorFormProps = {
  kind: IndexKind;
  kinds: IndexKind[];
  fields: IndexField[];
  columnOptions: ColumnOption[];
  isEditing: boolean;
  submitLabel: string;
  onKindChange: (kind: IndexKind) => void;
  onClose: () => void;
};

export function IndexEditorForm({
  kind,
  kinds,
  fields,
  columnOptions,
  isEditing,
  submitLabel,
  onKindChange,
  onClose,
}: IndexEditorFormProps) {
  const [firstField, ...restFields] = fields;

  const renderField = (field: IndexField, autoFocus = false) => (
    <IndexFieldInput
      key={field.name}
      field={field}
      columnOptions={columnOptions}
      disabled={isEditing && field.name === "name"}
      autoFocus={autoFocus}
    />
  );

  return (
    <Form>
      <Stack gap="lg" mt="sm">
        {firstField && renderField(firstField, !isEditing)}

        <Select
          label={t`Index type`}
          description={getIndexTypeDescription()}
          data={kinds}
          value={kind}
          onChange={(value) => value && onKindChange(value)}
          disabled={isEditing}
          allowDeselect={false}
          renderOption={({ option }) => {
            const description = getKindDescription(option.value);
            return (
              <Stack gap="xs" p="sm">
                <Text fw="bold">{option.label}</Text>
                {description && (
                  <Text size="sm" c="text-secondary">
                    {description}
                  </Text>
                )}
              </Stack>
            );
          }}
        />

        {restFields.map((field) => renderField(field))}

        <Group justify="flex-end">
          <Box flex={1}>
            <FormErrorMessage />
          </Box>
          <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
          <FormSubmitButton label={submitLabel} variant="filled" />
        </Group>
      </Stack>
    </Form>
  );
}
