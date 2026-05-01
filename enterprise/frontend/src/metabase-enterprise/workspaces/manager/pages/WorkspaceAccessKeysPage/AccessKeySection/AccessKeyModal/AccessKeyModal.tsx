import { useState } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { CopyTextInput } from "metabase/common/components/CopyTextInput";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import {
  Alert,
  Button,
  FocusTrap,
  Group,
  Icon,
  Modal,
  Stack,
} from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import {
  useCreateWorkspaceAccessKeyMutation,
  useUpdateWorkspaceAccessKeyMutation,
} from "metabase-enterprise/api";
import type {
  Workspace,
  WorkspaceAccessKey,
  WorkspaceAccessKeyWithSecret,
} from "metabase-types/api";

type AccessKeyValues = {
  name: string;
};

const VALIDATION_SCHEMA = Yup.object({
  name: Yup.string().trim().required(Errors.required),
});

type CreateAccessKeyModalProps = {
  workspace: Workspace;
  onClose: () => void;
};

export function CreateAccessKeyModal({
  workspace,
  onClose,
}: CreateAccessKeyModalProps) {
  const [created, setCreated] = useState<WorkspaceAccessKeyWithSecret | null>(
    null,
  );

  return (
    <Modal opened title={t`Create access key`} padding="xl" onClose={onClose}>
      {created == null ? (
        <CreateAccessKeyForm
          workspace={workspace}
          onCancel={onClose}
          onCreated={setCreated}
        />
      ) : (
        <CreateAccessKeyResult accessKey={created} onClose={onClose} />
      )}
    </Modal>
  );
}

type CreateAccessKeyFormProps = {
  workspace: Workspace;
  onCancel: () => void;
  onCreated: (accessKey: WorkspaceAccessKeyWithSecret) => void;
};

function CreateAccessKeyForm({
  workspace,
  onCancel,
  onCreated,
}: CreateAccessKeyFormProps) {
  const [createAccessKey] = useCreateWorkspaceAccessKeyMutation();

  const handleSubmit = async (values: AccessKeyValues) => {
    const result = await createAccessKey({
      workspace_id: workspace.id,
      name: values.name.trim(),
    }).unwrap();
    onCreated(result);
  };

  return (
    <FormProvider
      initialValues={{ name: "" }}
      validationSchema={VALIDATION_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <FormTextInput
            name="name"
            label={t`Name`}
            placeholder={t`CI deployment`}
            data-autofocus
          />
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onCancel}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Create`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}

type CreateAccessKeyResultProps = {
  accessKey: WorkspaceAccessKeyWithSecret;
  onClose: () => void;
};

function CreateAccessKeyResult({
  accessKey,
  onClose,
}: CreateAccessKeyResultProps) {
  return (
    <Stack gap="md">
      <Alert color="warning" icon={<Icon name="warning" />}>
        {t`For security reasons this key is shown only once. Copy it now and store it safely.`}
      </Alert>
      <CopyTextInput label={accessKey.name} value={accessKey.key} readOnly />
      <Group justify="flex-end">
        <Button variant="filled" onClick={onClose}>
          {t`Done`}
        </Button>
      </Group>
    </Stack>
  );
}

type EditAccessKeyModalProps = {
  workspace: Workspace;
  accessKey: WorkspaceAccessKey;
  onClose: () => void;
};

export function EditAccessKeyModal({
  workspace,
  accessKey,
  onClose,
}: EditAccessKeyModalProps) {
  return (
    <Modal opened title={t`Rename access key`} padding="xl" onClose={onClose}>
      <FocusTrap.InitialFocus />
      <EditAccessKeyForm
        workspace={workspace}
        accessKey={accessKey}
        onCancel={onClose}
        onSaved={onClose}
      />
    </Modal>
  );
}

type EditAccessKeyFormProps = {
  workspace: Workspace;
  accessKey: WorkspaceAccessKey;
  onCancel: () => void;
  onSaved: () => void;
};

function EditAccessKeyForm({
  workspace,
  accessKey,
  onCancel,
  onSaved,
}: EditAccessKeyFormProps) {
  const [updateAccessKey] = useUpdateWorkspaceAccessKeyMutation();

  const handleSubmit = async (values: AccessKeyValues) => {
    await updateAccessKey({
      workspace_id: workspace.id,
      id: accessKey.id,
      name: values.name.trim(),
    }).unwrap();
    onSaved();
  };

  return (
    <FormProvider
      initialValues={{ name: accessKey.name }}
      validationSchema={VALIDATION_SCHEMA}
      onSubmit={handleSubmit}
    >
      {({ dirty }) => (
        <Form>
          <Stack gap="lg">
            <FormTextInput name="name" label={t`Name`} />
            <FormErrorMessage />
            <Group justify="flex-end">
              <Button onClick={onCancel}>{t`Cancel`}</Button>
              <FormSubmitButton
                label={t`Save`}
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
