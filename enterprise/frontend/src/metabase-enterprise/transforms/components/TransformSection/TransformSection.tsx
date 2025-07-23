import { t } from "ttag";

import { NameDescriptionInput } from "metabase/metadata/components/NameDescriptionInput";
import type { TransformSectionProps } from "metabase/plugins";
import {
  Button,
  Card,
  Group,
  Select,
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
    <Stack flex={1} p="xl" align="center">
      <Stack gap="lg" w="100%" maw="50rem" data-testid="transform-section">
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
          <Stack gap="xl">
            <Group justify="space-between">
              <Stack gap="sm">
                <Title order={4}>{t`Generated table settings`}</Title>
                <Text c="text-secondary">{t`Each transform creates a table in this database.`}</Text>
              </Stack>
              <Button>{t`Go to this table`}</Button>
            </Group>
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
        <Card p="xl" shadow="none" withBorder>
          <Stack gap="xl">
            <Group justify="space-between">
              <Title order={4}>{t`Schedule`}</Title>
              <Button>{t`Run now`}</Button>
            </Group>
            <Select label={t`How often should this transform run?`} />
          </Stack>
        </Card>
        <Group>
          <Button>{t`Delete`}</Button>
        </Group>
      </Stack>
    </Stack>
  );
}
