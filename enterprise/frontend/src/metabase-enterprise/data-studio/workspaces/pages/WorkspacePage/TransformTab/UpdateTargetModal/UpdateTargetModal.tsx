import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { hasFeature } from "metabase/admin/databases/utils";
import {
  skipToken,
  useGetDatabaseQuery,
  useListDatabaseSchemasQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import { useUpdateWorkspaceTransformMutation } from "metabase-enterprise/api";
import { SchemaFormSelect } from "metabase-enterprise/transforms/components/SchemaFormSelect";
import { sourceDatabaseId } from "metabase-enterprise/transforms/utils";
import type {
  UpdateWorkspaceTransformRequest,
  WorkspaceTransform,
} from "metabase-types/api";

import { useTransformValidation } from "../useTransformValidation";

type UpdateTargetModalProps = {
  transform: WorkspaceTransform;
  onUpdate: (transform?: WorkspaceTransform) => void;
  onClose: () => void;
};

export function UpdateTargetModal({
  transform,
  onUpdate,
  onClose,
}: UpdateTargetModalProps) {
  return (
    <Modal
      title={t`Change the target for this transform`}
      opened
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <Box mb="md">
        <Text size="sm" c="text-secondary">
          {t`When you change the target in a workspace, runs from this workspace write to an isolated workspace table. The original table isn't changed until you merge the workspace.`}
        </Text>
      </Box>
      <UpdateTargetForm
        transform={transform}
        onUpdate={onUpdate}
        onClose={onClose}
      />
    </Modal>
  );
}

type EditTransformValues = {
  targetName: string;
  targetSchema: string | null;
};

const EDIT_TRANSFORM_SCHEMA = Yup.object({
  targetName: Yup.string().required(Errors.required),
  targetSchema: Yup.string().nullable(),
});

type UpdateTargetFormProps = {
  transform: WorkspaceTransform;
  onUpdate: (transform?: WorkspaceTransform) => void;
  onClose: () => void;
};

function UpdateTargetForm({
  transform,
  onUpdate,
  onClose,
}: UpdateTargetFormProps) {
  const { source } = transform;
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const databaseId = sourceDatabaseId(source);
  const [updateWorkspaceTransform] = useUpdateWorkspaceTransformMutation();
  const initialValues = useMemo(() => getInitialValues(transform), [transform]);
  const validationSchemaExtension = useTransformValidation({
    databaseId,
    target: transform.target,
    workspaceId: transform.workspace_id,
  });

  const validationSchema = useMemo(
    () => EDIT_TRANSFORM_SCHEMA.shape(validationSchemaExtension),
    [validationSchemaExtension],
  );

  const {
    data: database,
    isLoading: isDatabaseLoading,
    error: databaseError,
  } = useGetDatabaseQuery(databaseId ? { id: databaseId } : skipToken);

  const {
    data: schemas = [],
    isLoading: isSchemasLoading,
    error: schemasError,
  } = useListDatabaseSchemasQuery(
    databaseId ? { id: databaseId, include_hidden: true } : skipToken,
  );

  const isLoading = isDatabaseLoading || isSchemasLoading;
  const error = databaseError ?? schemasError;
  const supportsSchemas = database && hasFeature(database, "schemas");

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const handleSubmit = async (values: EditTransformValues) => {
    if (!databaseId) {
      throw new Error("Database ID is required");
    }

    try {
      const updatedTransform = await updateWorkspaceTransform(
        getUpdateTargetRequest(transform, values, databaseId),
      ).unwrap();

      sendSuccessToast(t`Transform target updated`);

      onUpdate(updatedTransform);
    } catch (error) {
      sendErrorToast(t`Failed to update transform target`);
    }
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={handleSubmit}
      enableReinitialize
      validateOnMount
    >
      {({ dirty }) => (
        <Form>
          <Stack gap="lg">
            {supportsSchemas && (
              <SchemaFormSelect
                name="targetSchema"
                label={t`Schema`}
                data={schemas}
              />
            )}
            <FormTextInput name="targetName" label={t`New table name`} />
            <Group>
              <Box flex={1}>
                <FormErrorMessage />
              </Box>
              <Button onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton
                label={t`Change target`}
                variant="filled"
                disabled={!dirty}
              />
            </Group>
          </Stack>
        </Form>
      )}
    </FormProvider>
  );
}

function getInitialValues({ target }: WorkspaceTransform): EditTransformValues {
  return {
    targetName: target.name,
    targetSchema: target.schema ?? null,
  };
}

function getUpdateTargetRequest(
  { ref_id, workspace_id }: WorkspaceTransform,
  { targetName: name, targetSchema: schema }: EditTransformValues,
  databaseId: number,
): UpdateWorkspaceTransformRequest {
  return {
    workspaceId: workspace_id,
    transformId: ref_id,
    target: {
      type: "table",
      name,
      schema,
      database: databaseId,
    },
  };
}
