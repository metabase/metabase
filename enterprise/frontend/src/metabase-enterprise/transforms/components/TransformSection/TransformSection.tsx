import { t } from "ttag";

import { NameDescriptionInput } from "metabase/metadata/components/NameDescriptionInput";
import type { TransformSectionProps } from "metabase/plugins";
import {
  Button,
  Card,
  Group,
  Stack,
  Text,
  TextInputBlurChange,
  Title,
} from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

export function TransformSection({ transformId }: TransformSectionProps) {
  const { data: transform } = useGetTransformQuery(transformId);

  if (!transform) {
    return null;
  }

  return <TransformSettings transform={transform} />;
}

type TransformSettingsProps = {
  transform: Transform;
};

function TransformSettings({ transform }: TransformSettingsProps) {
  return (
    <Stack
      flex={1}
      p="xl"
      gap="lg"
      bg="accent-gray-light"
      data-testid="transform-section"
    >
      <NameDescriptionInput
        name={transform.name}
        nameIcon="refresh_downstream"
        nameMaxLength={254}
        namePlaceholder={t`Give this transform a name`}
        description=""
        descriptionPlaceholder={t`Give this transform a description`}
        onNameChange={() => undefined}
        onDescriptionChange={() => undefined}
      />
      <Card p="xl" shadow="none" withBorder>
        <Stack px="sm" gap="xl">
          <Stack gap="sm">
            <Title order={4}>{t`Generated table settings`}</Title>
            <Text c="text-secondary">{t`Each transform creates a table in this database.`}</Text>
          </Stack>
          <TextInputBlurChange
            label={t`What should the generated table be called in the database?`}
            value={transform.target.table}
            onBlurChange={() => undefined}
          />
          <TextInputBlurChange
            label={t`The schema where this table should go`}
            value={transform.target.schema}
            onBlurChange={() => undefined}
          />
        </Stack>
      </Card>
      <Group>
        <Button>{t`Run now`}</Button>
        <Button>{t`Delete`}</Button>
      </Group>
    </Stack>
  );
}
