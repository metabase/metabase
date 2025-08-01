import { useMemo } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";
import * as Yup from "yup";

import { skipToken, useListDatabaseSchemasQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormRadioGroup,
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

type EditTransformAction = "keep-target" | "delete-target";

type EditTransformValues = {
  type: TransformTargetType;
  name: string;
  schema: string | null;
  action: EditTransformAction;
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
    if (values.action === "delete-target") {
      await deleteTransformTarget(transform.id);
    }
    await updateTransform(getUpdateRequest(transform, values));
    onUpdate();
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={EDIT_TRANSFORM_SCHEMA}
      onSubmit={handleSubmit}
    >
      {({ values }) => (
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
            <FormRadioGroup
              name="action"
              label={getActionLabel(target)}
              description={jt`You can keep or delete ${(<strong>{target.name}</strong>)}. Deleting it can’t be undone, and will break queries that used it. Please be careful!`}
            >
              <Stack gap="sm">
                <Radio value="keep-target" label={t`Keep ${target.name}`} />
                <Radio value="delete-target" label={t`Delete ${target.name}`} />
              </Stack>
            </FormRadioGroup>
            <FormErrorMessage />
            <Group justify="end">
              <Button onClick={onCancel}>{t`Cancel`}</Button>
              <FormSubmitButton
                label={getSubmitButtonLabel(values)}
                color={getSubmitButtonColor(values)}
                variant="filled"
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
    action: "keep-target",
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

function getSubmitButtonLabel({ action }: EditTransformValues) {
  return match(action)
    .with("keep-target", () => t`Change target`)
    .with("delete-target", () => t`Change target and delete the old one`)
    .exhaustive();
}

function getSubmitButtonColor({ action }: EditTransformValues) {
  return match(action)
    .with("keep-target", () => undefined)
    .with("delete-target", () => "error")
    .exhaustive();
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
