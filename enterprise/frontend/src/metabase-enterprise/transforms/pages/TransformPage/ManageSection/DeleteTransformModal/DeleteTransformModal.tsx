import { match } from "ts-pattern";
import { jt, t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormRadioGroup,
  FormSubmitButton,
} from "metabase/forms";
import { Button, Group, Modal, Radio, Stack, Text } from "metabase/ui";
import {
  useDeleteTransformMutation,
  useDeleteTransformTargetMutation,
} from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

type DeleteTransformModalProps = {
  transform: Transform;
  onDelete: () => void;
  onCancel: () => void;
};

export function DeleteTransformModal({
  transform,
  onDelete,
  onCancel,
}: DeleteTransformModalProps) {
  return (
    <Modal
      title={getModalTitle(transform)}
      opened
      padding="xl"
      onClose={onCancel}
    >
      <DeleteTransformForm
        transform={transform}
        onDelete={onDelete}
        onCancel={onCancel}
      />
    </Modal>
  );
}

type DeleteTransformAction = "transform-only" | "transform-with-target";

type DeleteTransformValues = {
  action: DeleteTransformAction;
};

const INITIAL_VALUES: DeleteTransformValues = {
  action: "transform-only",
};

const DELETE_TRANSFORM_SCHEMA = Yup.object({
  action: Yup.string().oneOf(["transform-only", "transform-with-target"]),
});

type DeleteTransformFormProps = {
  transform: Transform;
  onDelete: () => void;
  onCancel: () => void;
};

function DeleteTransformForm({
  transform,
  onDelete,
  onCancel,
}: DeleteTransformFormProps) {
  const [deleteTransform] = useDeleteTransformMutation();
  const [deleteTransformTarget] = useDeleteTransformTargetMutation();

  const handleSubmit = async ({ action }: DeleteTransformValues) => {
    if (action === "transform-with-target") {
      await deleteTransformTarget(transform.id);
    }
    await deleteTransform(transform.id);
    onDelete();
  };

  return (
    <FormProvider
      initialValues={INITIAL_VALUES}
      validationSchema={DELETE_TRANSFORM_SCHEMA}
      onSubmit={handleSubmit}
    >
      {({ values }) => (
        <Form>
          <Stack gap="lg">
            <Text>{getFormMessage(transform)}</Text>
            {transform.table && (
              <FormRadioGroup name="action">
                <Stack gap="sm">
                  <Radio
                    value="transform-only"
                    label={t`Delete the transform only`}
                  />
                  <Radio
                    value="transform-with-target"
                    label={t`Delete the transform and the view`}
                  />
                </Stack>
              </FormRadioGroup>
            )}
            <FormErrorMessage />
            <Group justify="end">
              <Button onClick={onCancel}>{t`Cancel`}</Button>
              <FormSubmitButton
                label={getSubmitButtonLabel(transform, values)}
                variant="filled"
                color="error"
              />
            </Group>
          </Stack>
        </Form>
      )}
    </FormProvider>
  );
}

function getModalTitle({ target, table }: Transform) {
  return match({ type: target.type, hasTarget: table != null })
    .with({ hasTarget: false }, () => t`Delete this transform?`)
    .with(
      { type: "view" },
      () => t`Delete only the transform, or the view it generates, too?`,
    )
    .with(
      { type: "table" },
      () => t`Delete only the transform, or the table it generates, too?`,
    )
    .exhaustive();
}

function getFormMessage({ target, table }: Transform) {
  const tableName = <strong key="name">{target.name}</strong>;

  return match({ type: target.type, hasTarget: table != null })
    .with(
      { type: "view", hasTarget: false },
      () => jt`The target view, ${tableName}, has not been generated yet.`,
    )
    .with(
      { type: "view", hasTarget: true },
      () =>
        jt`If you want you can additionally delete the view this transform generated, ${tableName}. Deleting the view will break queries that used it. This can’t be undone, so please be careful.`,
    )
    .with(
      { type: "table", hasTarget: false },
      () => jt`The target table, ${tableName}, has not been generated yet.`,
    )
    .with(
      { type: "table", hasTarget: true },
      () =>
        jt`If you want you can additionally delete the table this transform generated, ${tableName}. Deleting the table will break queries that used it. This can’t be undone, so please be careful.`,
    )
    .exhaustive();
}

function getSubmitButtonLabel(
  { target, table }: Transform,
  { action }: DeleteTransformValues,
) {
  return match({
    action,
    type: target.type,
    hasTarget: table != null,
  })
    .with({ hasTarget: false }, () => t`Delete transform`)
    .with({ action: "transform-only" }, () => t`Delete transform only`)
    .with({ type: "view" }, () => t`Delete transform and view`)
    .with({ type: "table" }, () => t`Delete transform and table`)
    .exhaustive();
}
