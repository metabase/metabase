import { t } from "ttag";

import { Box, Button, Group, Icon, Stack } from "metabase/ui";
import {
  useLazyGetTransformQuery,
  useRunTransformJobMutation,
  useRunTransformMutation,
  useUpdateTransformMutation,
  useUpdateWorkspaceContentsMutation,
} from "metabase-enterprise/api";
import type {
  DraftTransformSource,
  Transform,
  TransformId,
  WorkspaceId,
} from "metabase-types/api";

import { TransformEditor } from "./TransformEditor";
import { type EditedTransform, useWorkspace } from "./WorkspaceProvider";

interface Props {
  editedTransform: EditedTransform;
  transform: Transform;
  workspaceId: WorkspaceId;
  onChange: (source: DraftTransformSource) => void;
  onOpenTransform: (transformId: TransformId) => void;
}

export const TransformTab = ({
  editedTransform,
  transform,
  workspaceId,
  onChange,
  onOpenTransform,
}: Props) => {
  const [getTransform] = useLazyGetTransformQuery();
  const [updateTransform] = useUpdateTransformMutation();
  const [updateWorkspaceContents] = useUpdateWorkspaceContentsMutation();
  useRunTransformJobMutation();

  const { addOpenedTransform, removeOpenedTransform, setActiveTransform } =
    useWorkspace();

  const isSaved = transform.workspace_id === workspaceId;

  const [runTransform] = useRunTransformMutation();

  const handleRun = async () => {
    runTransform(transform.id);
  };

  const handleSave = async () => {
    if (isSaved) {
      updateTransform({
        id: transform.id,
        source: editedTransform.source,
      });
    } else {
      const response = await updateWorkspaceContents({
        id: workspaceId,
        add: {
          transforms: [transform.id],
        },
      });

      const newTransform = response.data?.contents.transforms.find(
        (t) => t.upstream_id === transform.id,
      );
      const newTransformId = newTransform?.id;

      if (newTransformId != null) {
        // TODO: remove when backend adds contents hydration to previous request
        const newTransform = await getTransform(newTransformId).unwrap();

        if (newTransform) {
          addOpenedTransform(newTransform);
          removeOpenedTransform(transform.id);
          setActiveTransform(newTransform);
          onOpenTransform(newTransform.id);
        }
      }
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
          {isSaved && (
            <Button
              leftSection={<Icon name="play" />}
              size="sm"
              onClick={handleRun}
            >{t`Run`}</Button>
          )}

          <Button
            size="sm"
            variant="filled"
            onClick={handleSave}
          >{t`Save`}</Button>
        </Group>
      </Group>

      {editedTransform && (
        <Box flex="1">
          <TransformEditor
            source={editedTransform.source}
            onChange={onChange}
          />
        </Box>
      )}
    </Stack>
  );
};
