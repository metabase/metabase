import { useState } from "react";
import { jt, t } from "ttag";

import {
  useDeleteTransformMutation,
  useDeleteTransformTargetMutation,
  useGetTransformQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import {
  Box,
  Button,
  FocusTrap,
  Group,
  Modal,
  Radio,
  Stack,
  Text,
} from "metabase/ui";
import type { Transform } from "metabase-types/api";

type DeleteTransformModalProps = {
  transform: Transform;
  onDelete: () => void;
  onClose: () => void;
};

export function DeleteTransformModal({
  transform,
  onDelete,
  onClose,
}: DeleteTransformModalProps) {
  const {
    data: transformWithTable,
    isLoading,
    error,
  } = useGetTransformQuery(transform.id);

  return (
    <Modal
      title={getModalTitle(transform)}
      opened
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      {isLoading || error != null || transformWithTable == null ? (
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      ) : (
        <DeleteTransformForm
          transform={transformWithTable}
          onDelete={onDelete}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

type DeleteTransformFormProps = {
  transform: Transform;
  onDelete: () => void;
  onClose: () => void;
};

function DeleteTransformForm({
  transform,
  onDelete,
  onClose,
}: DeleteTransformFormProps) {
  const [deleteTransform] = useDeleteTransformMutation();
  const [deleteTransformTarget] = useDeleteTransformTargetMutation();
  const [shouldDeleteTarget, setShouldDeleteTarget] = useState(false);

  const handleSubmit = async () => {
    if (transform == null) {
      return;
    }
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
                <Radio
                  value="true"
                  label={t`Delete the transform and the table`}
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

function getModalTitle(transform: Transform) {
  return transform.table != null
    ? t`Delete only the transform, or the table it generates, too?`
    : t`Delete this transform?`;
}

function getFormMessage({ target, table }: Transform) {
  const tableName = <strong key="name">{target.name}</strong>;
  return table != null
    ? jt`If you want you can additionally delete the table this transform generated, ${tableName}. Deleting the table will break queries that used it. This can’t be undone, so please be careful.`
    : jt`Deleting this transform won’t delete any tables.`;
}

function getSubmitButtonLabel(
  { table }: Transform,
  shouldDeleteTarget: boolean,
) {
  if (table == null) {
    return t`Delete transform`;
  }
  return shouldDeleteTarget
    ? t`Delete transform and table`
    : t`Delete transform only`;
}
