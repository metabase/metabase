import { t } from "ttag";

import { Box, Button, Group, Icon, Stack } from "metabase/ui";
import {
  useGetWorkspaceContentsQuery,
  useUpdateWorkspaceContentsMutation,
} from "metabase-enterprise/api";
import type { DraftTransformSource, WorkspaceId } from "metabase-types/api";

import { TransformEditor } from "./TransformEditor";
import type { WorkspaceTransform } from "./WorkspaceProvider";

interface Props {
  transform: WorkspaceTransform;
  workspaceId: WorkspaceId;
}

export const TransformTab = ({ transform, workspaceId }: Props) => {
  const { data } = useGetWorkspaceContentsQuery(workspaceId);
  const [updateWorkspaceContents] = useUpdateWorkspaceContentsMutation();

  const isSaved = data?.contents.transforms.some((t) => t.id === transform.id);

  const handleRun = () => {};

  const handleSave = () => {
    if (!isSaved) {
      updateWorkspaceContents({
        id: workspaceId,
        add_upstream: {
          transforms: [transform.id],
        },
      });
    } else {
      window.alert("TODO");
    }
  };

  return (
    <Stack gap={0} h="100%">
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
