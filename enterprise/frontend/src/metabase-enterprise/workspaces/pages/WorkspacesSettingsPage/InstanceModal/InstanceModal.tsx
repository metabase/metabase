import { useFormikContext } from "formik";
import { t } from "ttag";
import * as Yup from "yup";

import { useToast } from "metabase/common/hooks/use-toast";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Button, Group, Modal, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import {
  useCreateWorkspaceInstanceMutation,
  useTestWorkspaceInstanceConnectionMutation,
  useUpdateWorkspaceInstanceMutation,
} from "metabase-enterprise/api";
import type { WorkspaceInstance } from "metabase-types/api";

export type InstanceModalProps = {
  // when set, the modal edits this instance instead of connecting a new one
  instance?: WorkspaceInstance;
  opened: boolean;
  onClose: () => void;
};

export function InstanceModal({
  instance,
  opened,
  onClose,
}: InstanceModalProps) {
  return (
    <Modal
      title={instance ? t`Edit this instance?` : t`Connect an instance`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <InstanceForm instance={instance} onClose={onClose} />
    </Modal>
  );
}

type InstanceFormValues = {
  name: string;
  url: string;
  api_key: string;
};

const NEW_INSTANCE_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  url: Yup.string().required(Errors.required),
  api_key: Yup.string().required(Errors.required),
});

const EDIT_INSTANCE_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  url: Yup.string().required(Errors.required),
  api_key: Yup.string(),
});

type InstanceFormProps = {
  instance?: WorkspaceInstance;
  onClose: () => void;
};

function InstanceForm({ instance, onClose }: InstanceFormProps) {
  const [createInstance] = useCreateWorkspaceInstanceMutation();
  const [updateInstance] = useUpdateWorkspaceInstanceMutation();

  const handleSubmit = async ({ name, url, api_key }: InstanceFormValues) => {
    if (instance) {
      await updateInstance({
        id: instance.id,
        name,
        url,
        // the stored key is never echoed back, so an untouched field means "keep it"
        api_key: api_key.length > 0 ? api_key : undefined,
      }).unwrap();
    } else {
      await createInstance({ name, url, api_key }).unwrap();
    }
    onClose();
  };

  return (
    <FormProvider
      initialValues={{
        name: instance?.name ?? "",
        url: instance?.url ?? "",
        api_key: "",
      }}
      validationSchema={instance ? EDIT_INSTANCE_SCHEMA : NEW_INSTANCE_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <FormTextInput
            name="name"
            label={t`Name`}
            placeholder={t`Development instance`}
            data-autofocus
          />
          <FormTextInput
            name="url"
            label={t`URL`}
            placeholder="https://metabase-dev.example.com"
          />
          <FormTextInput
            name="api_key"
            type="password"
            label={t`API key`}
            description={t`An API key created on the instance for an admin group.`}
            placeholder={
              instance ? t`Leave blank to keep the current key` : "mb_..."
            }
          />
          <FormErrorMessage />
          <Group justify="space-between">
            <TestConnectionButton instance={instance} />
            <Group justify="flex-end">
              <Button onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton
                label={instance ? t`Save` : t`Connect`}
                variant="filled"
              />
            </Group>
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}

type TestConnectionButtonProps = {
  instance?: WorkspaceInstance;
};

function TestConnectionButton({ instance }: TestConnectionButtonProps) {
  const { values } = useFormikContext<InstanceFormValues>();
  const [testConnection, { isLoading }] =
    useTestWorkspaceInstanceConnectionMutation();
  const [sendToast] = useToast();

  const hasApiKey = values.api_key.length > 0 || instance != null;
  const canTest = values.url.length > 0 && hasApiKey;

  const handleTest = async () => {
    const result = await testConnection({
      url: values.url,
      api_key: values.api_key.length > 0 ? values.api_key : undefined,
      id: instance?.id,
    }).unwrap();
    if (result.ok) {
      sendToast({ message: t`Connection established`, icon: "check" });
    } else {
      sendToast({
        message: result.message ?? t`Could not connect to the instance`,
        icon: "warning",
        toastColor: "feedback-negative",
      });
    }
  };

  return (
    <Button
      variant="default"
      disabled={!canTest}
      loading={isLoading}
      onClick={handleTest}
    >
      {t`Test connection`}
    </Button>
  );
}
