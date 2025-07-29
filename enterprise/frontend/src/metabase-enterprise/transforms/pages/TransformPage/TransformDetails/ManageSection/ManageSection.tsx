import { Link } from "react-router";
import { t } from "ttag";

import { Button, Card, Group, Icon, Stack, Text, Title } from "metabase/ui";
import { transformQueryUrl } from "metabase-enterprise/transforms/utils/urls";
import type { Transform } from "metabase-types/api";

export type ManageSectionProps = {
  transform: Transform;
};

export function ManageSection({ transform }: ManageSectionProps) {
  return (
    <Group align="start" gap="5rem">
      <Stack>
        <Title order={4} c="text-primary">{t`Manage this transform`}</Title>
        <Text c="text-secondary">{t`Change what this transform generates and where.`}</Text>
      </Stack>
      <Card px="xl" py="lg">
        <Button leftSection={<Icon name="play" />}>{t`Run now`}</Button>
        <Button
          component={Link}
          to={transformQueryUrl(transform.id)}
          leftSection={<Icon name="pencil_lines" />}
        >
          {t`Edit query`}
        </Button>
        <Button leftSection={<Icon name="trash" />}>{t`Delete`}</Button>
      </Card>
    </Group>
  );
}
