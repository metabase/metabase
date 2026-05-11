import { Link } from "react-router";
import { t } from "ttag";

import { Button, Card, Group, Icon, Stack, Text, Title } from "metabase/ui";
import type { Workspace } from "metabase-types/api";

export type SetupSectionProps = {
  workspace: Workspace;
};

export function SetupSection({ workspace }: SetupSectionProps) {
  return (
    <Card bg="background-info" p="lg">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Stack>
          <Title order={4}>{t`How to set up a development instance`}</Title>
          <Text maw="40rem">
            {
              // eslint-disable-next-line metabase/no-literal-metabase-strings -- referring to the product name is intentional
              t`Run a local Metabase instance backed by this workspace's data so you can make changes safely. Pass this config.yml file, containing the database credentials, when starting the instance.`
            }
          </Text>
        </Stack>
        <Button
          component={Link}
          to={`/api/ee/workspace-manager/${workspace.id}/config`}
          leftSection={<Icon name="download" />}
        >
          {t`Download config.yml`}
        </Button>
      </Group>
    </Card>
  );
}
