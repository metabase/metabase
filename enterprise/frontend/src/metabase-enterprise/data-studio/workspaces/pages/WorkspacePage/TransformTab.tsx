import { t } from "ttag";

import { Box, Button, Group, Icon, Stack } from "metabase/ui";
import { useUpdateWorkspaceContentsMutation } from "metabase-enterprise/api";
import type { DraftTransformSource, WorkspaceId } from "metabase-types/api";

import { TransformEditor } from "./TransformEditor";
import type { WorkspaceTransform } from "./WorkspaceProvider";

interface Props {
  isSaved?: boolean; // TODO
  transform: WorkspaceTransform;
  workspaceId: WorkspaceId;
}

export const TransformTab = ({ isSaved, transform, workspaceId }: Props) => {
  const [updateWorkspaceContents] = useUpdateWorkspaceContentsMutation();

  const handleRun = () => {};

  const handleSave = () => {
    if (!isSaved) {
      updateWorkspaceContents({
        id: workspaceId,
        add_upstream: {
          transforms: [transform.id],
        },
      });
    }
  };

  return (
    <Stack gap={0}>
      <Group
        flex="0 0 auto"
        justify="space-between"
        p="md"
        style={{ borderBottom: "1px solid var(--mb-color-border" }}
      >
        <Group>{t`Output table input?`}</Group>

        <Group>
          <Button
            leftSection={<Icon name="play" />}
            size="sm"
            onClick={handleRun}
          >{t`Run`}</Button>

          <Button
            size="sm"
            variant="filled"
            onClick={handleSave}
          >{t`Save`}</Button>
        </Group>
      </Group>

      <Box flex="1">
        <TransformEditor source={transform.source as DraftTransformSource} />
      </Box>
    </Stack>
  );
};
