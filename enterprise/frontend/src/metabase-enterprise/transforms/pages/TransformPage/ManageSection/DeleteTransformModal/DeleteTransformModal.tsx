import { useState } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
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
  const [shouldDeleteTarget, setShouldDeleteTarget] = useState(false);

  const handleSubmit = async () => {
    if (shouldDeleteTarget) {
      await deleteTransformTarget(transform.id).unwrap();
    }
    await deleteTransform(transform.id).unwrap();
    onDelete();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack gap="lg">
          <Text>{getFormMessage(transform)}</Text>
          {transform.table && (
            <Radio.Group
              value={shouldDeleteTarget.toString()}
              onChange={(value) => setShouldDeleteTarget(value === "true")}
            >
              <Stack gap="sm">
                <Radio value="false" label={t`Delete the transform only`} />
                <Radio value="true" label={getRadioLabel(transform)} />
              </Stack>
            </Radio.Group>
          )}
          <FormErrorMessage />
          <Group justify="end">
            <Button onClick={onCancel}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={getSubmitButtonLabel(transform, shouldDeleteTarget)}
              variant="filled"
              color="error"
            />
          </Group>
        </Stack>
      </Form>
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

function getRadioLabel({ target }: Transform) {
  return match(target.type)
    .with("view", () => t`Delete the transform and the view`)
    .with("table", () => t`Delete the transform and the table`)
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
  shouldDeleteTarget: boolean,
) {
  return match({
    type: target.type,
    hasTarget: table != null,
    shouldDeleteTarget,
  })
    .with({ hasTarget: false }, () => t`Delete transform`)
    .with({ shouldDeleteTarget: false }, () => t`Delete transform only`)
    .with({ type: "view" }, () => t`Delete transform and view`)
    .with({ type: "table" }, () => t`Delete transform and table`)
    .exhaustive();
}
