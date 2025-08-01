import { useMemo, useState } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";
import * as Yup from "yup";

import { skipToken, useListDatabaseSchemasQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSegmentedControl,
  FormSelect,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Button, Group, Modal, Radio, Stack } from "metabase/ui";
import {
  useDeleteTransformTargetMutation,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import type {
  Transform,
  TransformTarget,
  TransformTargetType,
  UpdateTransformRequest,
} from "metabase-types/api";

type UpdateTargetModalProps = {
  transform: Transform;
  onUpdate: () => void;
  onCancel: () => void;
};

export function UpdateTargetModal({
  transform,
  onUpdate,
  onCancel,
}: UpdateTargetModalProps) {
  return (
    <Modal
      title={t`Change the target for this transform`}
      opened
      padding="xl"
      onClose={onCancel}
    >
      <UpdateTargetForm
        transform={transform}
        onUpdate={onUpdate}
        onCancel={onCancel}
      />
    </Modal>
  );
}

type EditTransformValues = {
  type: TransformTargetType;
  name: string;
  schema: string | null;
};

const EDIT_TRANSFORM_SCHEMA = Yup.object({
  type: Yup.string().oneOf(["view", "table"]),
  name: Yup.string().required(Errors.required),
  schema: Yup.string().nullable(),
  action: Yup.string().oneOf(["keep-target", "delete-target"]),
});

type UpdateTargetFormProps = {
  transform: Transform;
  onUpdate: () => void;
  onCancel: () => void;
};

function UpdateTargetForm({
  transform,
  onUpdate,
  onCancel,
}: UpdateTargetFormProps) {
  const { source, target } = transform;
  const { database: databaseId } = source.query;
  const [updateTransform] = useUpdateTransformMutation();
  const [deleteTransformTarget] = useDeleteTransformTargetMutation();
  const initialValues = useMemo(() => getInitialValues(transform), [transform]);
  const [shouldDeleteTarget, setShouldDeleteTarget] = useState(false);

  const {
    data: schemas = [],
    isLoading,
    error,
  } = useListDatabaseSchemasQuery(
    databaseId ? { id: databaseId, include_hidden: true } : skipToken,
  );

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const handleSubmit = async (values: EditTransformValues) => {
    if (shouldDeleteTarget) {
      await deleteTransformTarget(transform.id).unwrap();
    }
    await updateTransform(getUpdateRequest(transform, values)).unwrap();
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
            <FormSegmentedControl
              name="type"
              label={t`Should this transform create a view or a table in the database?`}
              data={getTypeOptions()}
            />
            <FormTextInput
              name="name"
              label={t`What should it be called in the database?`}
            />
            {schemas.length > 0 && (
              <FormSelect
                name="schema"
                label={t`In which schema should it go?`}
                data={schemas}
              />
            )}
            <Radio.Group
              value={shouldDeleteTarget.toString()}
              label={getActionLabel(target)}
              description={jt`You can keep or delete ${(
                <strong>{target.name}</strong>
              )}. Deleting it can’t be undone, and will break queries that used it. Please be careful!`}
              onChange={(value) => setShouldDeleteTarget(value === "true")}
            >
              <Stack gap="sm">
                <Radio value="false" label={t`Keep ${target.name}`} />
                <Radio value="true" label={t`Delete ${target.name}`} />
              </Stack>
            </Radio.Group>
            <FormErrorMessage />
            <Group justify="end">
              <Button onClick={onCancel}>{t`Cancel`}</Button>
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
    type: target.type,
    name: target.name,
    schema: target.schema,
  };
}

function getTypeOptions() {
  return [
    { value: "view", label: t`View` },
    { value: "table", label: t`Table` },
  ];
}

function getActionLabel(target: TransformTarget) {
  return match(target.type)
    .with("view", () => t`Keep the old target view, or delete it?`)
    .with("table", () => t`Keep the old target table, or delete it?`)
    .exhaustive();
}

function getSubmitButtonLabel(shouldDeleteTarget: boolean) {
  return shouldDeleteTarget
    ? t`Change target and delete the old one`
    : t`Change target`;
}

function getSubmitButtonColor(shouldDeleteTarget: boolean) {
  return shouldDeleteTarget ? "error" : undefined;
}

function getUpdateRequest(
  { id }: Transform,
  { type, name, schema }: EditTransformValues,
): UpdateTransformRequest {
  return {
    id,
    target: {
      type,
      name,
      schema,
    },
  };
}
