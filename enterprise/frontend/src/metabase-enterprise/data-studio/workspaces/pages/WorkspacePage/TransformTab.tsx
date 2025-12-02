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
import { useRunTransformMutation } from "metabase-enterprise/api";
import { isSameSource } from "metabase-enterprise/transforms/utils";
import type {
  DatabaseId,
  DraftTransformSource,
  Transform,
  TransformId,
  WorkspaceId,
} from "metabase-types/api";

import { CheckOutTransformButton } from "./CheckOutTransformButton";
import { SaveTransformButton } from "./SaveTransformButton";
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
  const { markTransformAsRun } = useWorkspace();

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

          {isSaved && (
            <SaveTransformButton
              databaseId={databaseId}
              editedTransform={editedTransform}
              transform={transform}
            />
          )}

          {!isSaved && (
            <CheckOutTransformButton
              transform={transform}
              workspaceId={workspaceId}
              onOpenTransform={onOpenTransform}
            />
          )}
        </Group>
      </Group>

      {editedTransform && (
        <Box flex="1">
          <TransformEditor
            disabled={!isSaved}
            source={editedTransform.source}
            onChange={handleSourceChange}
          />
        </Box>
      )}
    </Stack>
  );
};
