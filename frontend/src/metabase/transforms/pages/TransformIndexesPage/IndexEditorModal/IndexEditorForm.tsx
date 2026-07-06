import { t } from "ttag";

import { Form, FormSubmitButton } from "metabase/forms";
import { Alert, Button, Group, Icon, Select, Stack, Text } from "metabase/ui";
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
  showRebuildWarning: boolean;
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
  showRebuildWarning,
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
        {showRebuildWarning && (
          <Alert icon={<Icon name="warning" />} color="warning">
            {t`Saving this index will cause the next run to reprocess all data from scratch instead of only new rows.`}
          </Alert>
        )}

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
          <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
          <FormSubmitButton label={submitLabel} variant="filled" />
        </Group>
      </Stack>
    </Form>
  );
}
