import { useDisclosure } from "@mantine/hooks";
import { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { Form, FormProvider, FormTextInput } from "metabase/forms";
<<<<<<< HEAD
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Button, Group, Icon, Stack, Text, rem } from "metabase/ui";
import { useRunTransformMutation, workspaceApi } from "metabase-enterprise/api";
import { UpdateTargetModal } from "metabase-enterprise/transforms/pages/TransformTargetPage/TargetSection/UpdateTargetModal";
import {
  isSameSource,
  isTransformRunning,
} from "metabase-enterprise/transforms/utils";
=======
import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Group, Icon, Stack, Text, rem } from "metabase/ui";
import { useRunTransformMutation } from "metabase-enterprise/api";
import { workspaceApi } from "metabase-enterprise/api/workspace";
import { isSameSource } from "metabase-enterprise/transforms/utils";
>>>>>>> b495f64cbdf (Cleanup. Add tables refetching on transform run)
import type {
  DatabaseId,
  DraftTransformSource,
  Transform,
  TransformId,
  WorkspaceId,
} from "metabase-types/api";

import { useTransformValidation } from "./AddTransformMenu";
import { CheckOutTransformButton } from "./CheckOutTransformButton";
import { SaveTransformButton } from "./SaveTransformButton";
import { TransformEditor } from "./TransformEditor";
import { type EditedTransform, useWorkspace } from "./WorkspaceProvider";
import { useDispatch } from "metabase/lib/redux";

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
  const { updateTransformState } = useWorkspace();
  const { sendSuccessToast } = useMetadataToasts();
  const [
    isChangeTargetModalOpen,
    { open: openChangeTargetModal, close: closeChangeTargetModal },
  ] = useDisclosure();
  const dispatch = useDispatch();

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

      // Invalidate the workspace tables cache since transform execution
      // may affect the list of workspace tables.
      if (transform.workspace_id) {
        dispatch(
          workspaceApi.util.invalidateTags([
            { type: "workspace", id: transform.workspace_id },
          ]),
        );
      }
    } catch (error) {
      console.error("Failed to run transform", error);
    }
  };

  const handleSourceChange = (source: DraftTransformSource) => {
    onChange({ source });
  };

  const handleNameChange = useCallback(
    (name: string) => {
      onChange({
        target: {
          type: editedTransform.target.type,
          name,
        },
      });
    },
    [onChange, editedTransform.target.type],
  );

  const validationSchemaExtension = useTransformValidation({
    databaseId,
    target: transform.target,
    workspaceId,
  });

  const validationSchema = useMemo(
    () =>
      Yup.object({
        targetName:
          validationSchemaExtension?.targetName ||
          Yup.string().required("Target table name is required"),
        targetSchema: Yup.string().nullable(),
      }),
    [validationSchemaExtension],
  );

  const initialValues = useMemo(
    () => ({
      targetName: editedTransform.target.name,
      targetSchema: transform.target.schema || null,
    }),
    [editedTransform.target.name, transform.target.schema],
  );

  const handleFormSubmit = useCallback(
    (values: typeof initialValues) => {
      handleNameChange(values.targetName);
    },
    [handleNameChange],
  );

  const handleFieldChange = useCallback(
    (field: string, value: string) => {
      if (field === "targetName") {
        handleNameChange(value);
      }
    },
    [handleNameChange],
  );

  const handleTargetUpdate = useCallback(
    (updatedTransform: Transform) => {
      const hasNameChanged = editedTransform.name !== transform.name;
      const hasSourceChanged = !isSameSource(
        editedTransform.source,
        transform.source,
      );

      const editedTransformToKeep =
        hasNameChanged || hasSourceChanged
          ? {
              name: editedTransform.name,
              source: editedTransform.source,
              target: {
                type: updatedTransform.target.type,
                name: updatedTransform.target.name,
              },
            }
          : null;

      updateTransformState(updatedTransform, editedTransformToKeep);
      sendSuccessToast(t`Transform target updated`);
      closeChangeTargetModal();
    },
    [
      closeChangeTargetModal,
      editedTransform.name,
      editedTransform.source,
      transform.name,
      transform.source,
      updateTransformState,
      sendSuccessToast,
    ],
  );

  const isRunning = isTransformRunning(transform);

  return (
    <Stack gap={0} h="100%">
      <Group
        flex="0 0 auto"
        justify="space-between"
        mih={rem(73)} // avoid CLS when showing/hiding output table input
        p="md"
        style={{ borderBottom: "1px solid var(--mb-color-border)" }}
      >
        <Group>
          {isSaved && (
            <FormProvider
              key={transform.id}
              initialValues={initialValues}
              validationSchema={validationSchema}
              onSubmit={handleFormSubmit}
            >
              <Form>
                <Group>
                  <Text
                    c="text-dark"
                    component="label"
                    fw="bold"
                  >{t`Output table`}</Text>
                  <FormTextInput
                    name="targetName"
                    miw={rem(300)}
                    onChange={(e) =>
                      handleFieldChange("targetName", e.target.value)
                    }
                  />
                </Group>
              </Form>
            </FormProvider>
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
            <Button
              leftSection={<Icon name="pencil_lines" />}
              size="sm"
              disabled={isRunning}
              onClick={openChangeTargetModal}
            >{t`Change target`}</Button>
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

      {isChangeTargetModalOpen && (
        <UpdateTargetModal
          transform={transform}
          onUpdate={handleTargetUpdate}
          onClose={closeChangeTargetModal}
        />
      )}
    </Stack>
  );
};
