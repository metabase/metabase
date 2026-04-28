import { jt } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Flex, Stack, Text, Title } from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import type { Workspace } from "metabase-types/api";

type WorkspaceHeaderProps = {
  workspace: Workspace;
};

export function WorkspaceHeader({ workspace }: WorkspaceHeaderProps) {
  const creatorName = workspace.creator ? getUserName(workspace.creator) : null;
  const date = <DateTime key="date" value={workspace.created_at} unit="day" />;

  return (
    <Flex
      data-testid="workspace-header-section"
      gap="1.25rem"
      justify="space-between"
      wrap="wrap"
    >
      <Stack gap="sm">
        <Title order={2}>{workspace.name}</Title>
        <Text size="sm" c="text-secondary">
          {creatorName
            ? jt`Created by ${creatorName} at ${date}`
            : jt`Created at ${date}`}
        </Text>
      </Stack>
    </Flex>
  );
}
