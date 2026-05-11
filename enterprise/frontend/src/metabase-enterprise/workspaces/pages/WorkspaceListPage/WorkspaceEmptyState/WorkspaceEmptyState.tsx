import { t } from "ttag";

import { Card, Stack, Text, Title } from "metabase/ui";

export function WorkspaceEmptyState() {
  return (
    <Card p="lg" shadow="none" withBorder>
      <Stack>
        <Title order={4}>{t`Isolated spaces for agents and developers`}</Title>
        <Text maw="25rem">
          {t`Develop and run transforms, and build your semantic layer without touching your production tables.`}
        </Text>
        <Text maw="25rem">
          {
            // eslint-disable-next-line metabase/no-literal-metabase-strings -- referring to the product name is intentional
            t`Create a workspace with Metabase's CLI. That will set up an isolated sandbox with a dedicated schema and database user in the data warehouse(s) you choose.`
          }
        </Text>
      </Stack>
    </Card>
  );
}
