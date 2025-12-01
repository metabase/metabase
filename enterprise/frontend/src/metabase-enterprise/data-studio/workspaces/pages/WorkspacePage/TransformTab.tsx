import type { ChangeEvent } from "react";
import { t } from "ttag";

import {
  Box,
  Button,
  Group,
  Icon,
  Stack,
  Text,
  TextInput,
  rem,
} from "metabase/ui";
import {
  useLazyGetTransformQuery,
  useRunTransformJobMutation,
  useRunTransformMutation,
  useUpdateTransformMutation,
  useUpdateWorkspaceContentsMutation,
} from "metabase-enterprise/api";
import { isSameSource } from "metabase-enterprise/transforms/utils";
import type {
  DatabaseId,
  DraftTransformSource,
  Transform,
  TransformId,
  WorkspaceId,
} from "metabase-types/api";

import { TransformEditor } from "./TransformEditor";
import { type EditedTransform, useWorkspace } from "./WorkspaceProvider";

interface Props {
  databaseId: DatabaseId;
  editedTransform: EditedTransform;
  transform: Transform;
  workspaceId: WorkspaceId;
  onChange: (patch: Partial<EditedTransform>) => void;
  onOpenTransform: (transformId: TransformId) => void;
}

export const TransformTab = ({
  databaseId,
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

  const {
    addOpenedTransform,
    removeOpenedTransform,
    setActiveTransform,
    markTransformAsRun,
  } = useWorkspace();

  const hasSourceChanged = !isSameSource(
    editedTransform.source,
    transform.source,
  );
  const hasTargetNameChanged =
    transform.target.name !== editedTransform.target.name;
  const hasChanges = hasSourceChanged || hasTargetNameChanged;

  const isSaved = transform.workspace_id === workspaceId;

  const [runTransform] = useRunTransformMutation();

  const handleRun = async () => {
    try {
      await runTransform(transform.id).unwrap();
      markTransformAsRun(transform.id);
    } catch (error) {
      console.error("Failed to run transform", error);
    }
  };

  const handleSourceChange = (source: DraftTransformSource) => {
    onChange({ source });
  };

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const name = event.target.value;

    onChange({
      target: {
        type: editedTransform.target.type,
        name,
      },
    });
  };

  const handleSave = async () => {
    if (isSaved) {
      const response = await updateTransform({
        id: transform.id,
        source: editedTransform.source,
        name: editedTransform.name,
        target: {
          type: "table",
          name: editedTransform.target.name,
          schema: transform.target.schema,
          database: databaseId,
        },
      });

      setActiveTransform(response.data);
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
        <Group>
          {isSaved && (
            <form>
              <Group>
                <Text
                  c="text-dark"
                  component="label"
                  fw="bold"
                >{t`Output table`}</Text>
                <TextInput
                  miw={rem(300)}
                  value={editedTransform.target.name}
                  onChange={handleNameChange}
                />
              </Group>
            </form>
          )}
        </Group>

        <Group>
          {isSaved && (
            <Button
              disabled={hasChanges}
              leftSection={<Icon name="play" />}
              size="sm"
              onClick={handleRun}
            >{t`Run`}</Button>
          )}

          <Button
            disabled={!hasChanges}
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
            onChange={handleSourceChange}
          />
        </Box>
      )}
    </Stack>
  );
};
