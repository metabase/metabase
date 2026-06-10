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
import { useCreateWorkspaceInstanceMutation } from "metabase-enterprise/api";
import type { WorkspaceInstance } from "metabase-types/api";

type CreateInstanceModalProps = {
  opened: boolean;
  onCreate: (instance: WorkspaceInstance) => void;
  onClose: () => void;
};

export function CreateInstanceModal({
  opened,
  onCreate,
  onClose,
}: CreateInstanceModalProps) {
  return (
    <Modal
      title={t`Add a development instance`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <CreateInstanceForm onCreate={onCreate} onClose={onClose} />
    </Modal>
  );
}

type CreateInstanceFormValues = {
  name: string;
  url: string;
  api_key: string;
};

const CREATE_INSTANCE_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  url: Yup.string().required(Errors.required),
  api_key: Yup.string().required(Errors.required),
});

const INITIAL_VALUES: CreateInstanceFormValues = {
  name: "",
  url: "",
  api_key: "",
};

type CreateInstanceFormProps = {
  onCreate: (instance: WorkspaceInstance) => void;
  onClose: () => void;
};

function CreateInstanceForm({ onCreate, onClose }: CreateInstanceFormProps) {
  const [createWorkspaceInstance] = useCreateWorkspaceInstanceMutation();

  const handleSubmit = async (values: CreateInstanceFormValues) => {
    const instance = await createWorkspaceInstance(values).unwrap();
    onCreate(instance);
  };

  return (
    <FormProvider
      initialValues={INITIAL_VALUES}
      validationSchema={CREATE_INSTANCE_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <FormTextInput
            name="name"
            label={t`Name`}
            placeholder={t`My development instance`}
            data-autofocus
          />
          <FormTextInput
            name="url"
            label={t`Instance URL`}
            placeholder="https://metabase.example.com"
          />
          <FormTextInput name="api_key" label={t`API key`} type="password" />
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Add`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
