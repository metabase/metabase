import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Button, Group, Modal, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { useUpdateWorkspaceInstanceMutation } from "metabase-enterprise/api";
import type { WorkspaceInstance } from "metabase-types/api";

export type EditInstanceModalProps = {
  instance: WorkspaceInstance;
  opened: boolean;
  onSave: (instance: WorkspaceInstance) => void;
  onClose: () => void;
};

export function EditInstanceModal({
  instance,
  opened,
  onSave,
  onClose,
}: EditInstanceModalProps) {
  return (
    <Modal
      title={t`Rename developer instance`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <EditInstanceForm instance={instance} onSave={onSave} onClose={onClose} />
    </Modal>
  );
}

type EditInstanceFormValues = {
  name: string;
};

const EDIT_INSTANCE_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
});

type EditInstanceFormProps = {
  instance: WorkspaceInstance;
  onSave: (instance: WorkspaceInstance) => void;
  onClose: () => void;
};

function EditInstanceForm({
  instance,
  onSave,
  onClose,
}: EditInstanceFormProps) {
  const [updateWorkspaceInstance] = useUpdateWorkspaceInstanceMutation();

  const handleSubmit = async ({ name }: EditInstanceFormValues) => {
    const saved = await updateWorkspaceInstance({
      id: instance.id,
      name,
    }).unwrap();
    onSave(saved);
  };

  return (
    <FormProvider
      initialValues={{ name: instance.name }}
      validationSchema={EDIT_INSTANCE_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <FormTextInput name="name" label={t`Name`} data-autofocus />
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Save`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
