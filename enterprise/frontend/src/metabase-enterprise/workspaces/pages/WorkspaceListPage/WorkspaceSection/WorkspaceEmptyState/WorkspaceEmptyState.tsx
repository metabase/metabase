import { t } from "ttag";

import { Button, Card, Stack, Text } from "metabase/ui";

type WorkspaceEmptyStateProps = {
  onCreate: () => void;
};

export function WorkspaceEmptyState({ onCreate }: WorkspaceEmptyStateProps) {
  return (
    <Card p="xl" shadow="none" withBorder>
      <Stack align="center" maw="25rem" mx="auto">
        <Text c="text-secondary" ta="center">
          {t`A workspace will be associated with a new git branch, and its content can be viewed and modified in a development instance.`}
        </Text>
        <Button variant="filled" onClick={onCreate}>
          {t`Create a workspace`}
        </Button>
      </Stack>
    </Card>
  );
}
