import { useMemo, useState } from "react";
import { jt, t } from "ttag";
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
import {
  Box,
  Button,
  FocusTrap,
  Group,
  Modal,
  Radio,
  Stack,
} from "metabase/ui";
import {
  useDeleteTransformTargetMutation,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import { SchemaFormSelect } from "metabase-enterprise/transforms/components/SchemaFormSelect";
import { sourceDatabaseId } from "metabase-enterprise/transforms/utils";
import type { Transform, UpdateTransformRequest } from "metabase-types/api";

type UpdateTargetModalProps = {
  transform: Transform;
  onUpdate: () => void;
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
      <UpdateTargetForm
        transform={transform}
        onUpdate={onUpdate}
        onClose={onClose}
      />
    </Modal>
  );
}

type EditTransformValues = {
  name: string;
  schema: string | null;
};

const EDIT_TRANSFORM_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  schema: Yup.string().nullable(),
});

type UpdateTargetFormProps = {
  transform: Transform;
  onUpdate: () => void;
  onClose: () => void;
};

function UpdateTargetForm({
  transform,
  onUpdate,
  onClose,
}: UpdateTargetFormProps) {
  const { source, target, table } = transform;
  const databaseId = sourceDatabaseId(source);
  const [updateTransform] = useUpdateTransformMutation();
  const [deleteTransformTarget] = useDeleteTransformTargetMutation();
  const initialValues = useMemo(() => getInitialValues(transform), [transform]);
  const [shouldDeleteTarget, setShouldDeleteTarget] = useState(false);

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
    if (shouldDeleteTarget) {
      await deleteTransformTarget(transform.id).unwrap();
    }
    await updateTransform(
      getUpdateRequest(transform, values, databaseId),
    ).unwrap();
    onUpdate();
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={EDIT_TRANSFORM_SCHEMA}
      onSubmit={handleSubmit}
    >
      {({ dirty }) => (
        <Form>
          <Stack gap="lg">
            {supportsSchemas && (
              <SchemaFormSelect
                name="schema"
                label={t`Schema`}
                data={schemas}
              />
            )}
            <FormTextInput name="name" label={t`New table name`} />
            {table != null && (
              <Radio.Group
                value={shouldDeleteTarget.toString()}
                label={t`Keep the old target table, or delete it?`}
                description={jt`If you keep ${(
                  <strong key="table">{target.name}</strong>
                )}, this transform will no longer update it. If you delete the table, you will break any queries that use it. Deletion can't be undone.`}
                onChange={(value) => setShouldDeleteTarget(value === "true")}
              >
                <Stack gap="sm">
                  <Radio
                    value="false"
                    label={jt`Keep ${(<strong key="table">{target.name}</strong>)}`}
                    data-testid="keep-target-radio"
                  />
                  <Radio
                    value="true"
                    label={jt`Delete ${(<strong key="table">{target.name}</strong>)}`}
                    data-testid="delete-target-radio"
                  />
                </Stack>
              </Radio.Group>
            )}
            <Group>
              <Box flex={1}>
                <FormErrorMessage />
              </Box>
              <Button onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton
                label={getSubmitButtonLabel(shouldDeleteTarget)}
                color={getSubmitButtonColor(shouldDeleteTarget)}
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

function getInitialValues({ target }: Transform): EditTransformValues {
  return {
    name: target.name,
    schema: target.schema,
  };
}

function getSubmitButtonLabel(shouldDeleteTarget: boolean) {
  return shouldDeleteTarget
    ? t`Change target and delete old table`
    : t`Change target`;
}

function getSubmitButtonColor(shouldDeleteTarget: boolean) {
  return shouldDeleteTarget ? "error" : undefined;
}

function getUpdateRequest(
  { id }: Transform,
  { name, schema }: EditTransformValues,
  databaseId: number,
): UpdateTransformRequest {
  return {
    id,
    target: {
      type: "table",
      name,
      schema,
      database: databaseId,
    },
  };
}
