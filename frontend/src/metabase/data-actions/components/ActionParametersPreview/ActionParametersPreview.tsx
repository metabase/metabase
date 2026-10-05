import { t } from "ttag";

import { getForm } from "metabase/actions/utils";
import { Badge, Card, Group, Stack, Text, TextInput, Title } from "metabase/ui";
import type { FieldType, WritebackAction } from "metabase-types/api";

type ActionParametersPreviewProps = {
  action: WritebackAction;
};

export function ActionParametersPreview({
  action,
}: ActionParametersPreviewProps) {
  const fieldSettings = action.visualization_settings?.fields ?? {};
  const { fields } = getForm(action.parameters ?? [], fieldSettings);

  return (
    <Stack p="lg" gap="md" data-testid="action-parameters-preview">
      <Stack gap="xs">
        <Title order={4}>{t`Parameters`}</Title>
        <Text c="text-secondary">
          {t`The form people fill in from a dashboard button or a public link.`}
        </Text>
      </Stack>
      {fields.length === 0 ? (
        <Text c="text-secondary">{t`This action has no parameters.`}</Text>
      ) : (
        <Card withBorder bg="background_page-secondary">
          <Stack gap="md">
            {fields.map((field) => {
              const settings = fieldSettings[field.name];
              return (
                <Stack key={field.name} gap="xs">
                  <Group justify="space-between" wrap="nowrap">
                    <Text fw="bold">{field.title}</Text>
                    <Badge variant="light" color="neutral">
                      {settings?.required === false
                        ? t`${getFieldTypeLabel(settings.fieldType)} · optional`
                        : t`${getFieldTypeLabel(settings?.fieldType)} · required`}
                    </Badge>
                  </Group>
                  <TextInput
                    aria-label={field.title}
                    placeholder={field.placeholder}
                    readOnly
                  />
                </Stack>
              );
            })}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

function getFieldTypeLabel(fieldType: FieldType | undefined): string {
  switch (fieldType) {
    case "number":
      return t`Number`;
    case "date":
      return t`Date`;
    default:
      return t`Text`;
  }
}
