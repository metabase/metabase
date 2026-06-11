import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Card, Stack, Text, Title } from "metabase/ui";
import type { Database } from "metabase-types/api";

import { NewWorkspaceButton } from "../NewWorkspaceButton";

export type WorkspaceEmptyStateProps = {
  databases: Database[];
};

export function WorkspaceEmptyState({ databases }: WorkspaceEmptyStateProps) {
  const applicationName = useSelector(getApplicationName);

  return (
    <Card p="xl" maw="40rem" mx="auto" shadow="none" withBorder>
      <Stack>
        <Title
          order={3}
        >{t`Use Workspaces to develop your semantic layer safely`}</Title>
        <Text c="text-secondary">
          {t`While in a workspace, ${applicationName} will remap tables created by transforms to an isolated schema, letting you test and build on top of these tables. When you're ready, use remote sync to pull your changes into your production ${applicationName}.`}
        </Text>
        <Box>
          <NewWorkspaceButton databases={databases} primary />
        </Box>
      </Stack>
    </Card>
  );
}
