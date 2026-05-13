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
import { useCreateWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

type NewWorkspaceModalProps = {
  opened: boolean;
  onCreate: (workspace: Workspace) => void;
  onClose: () => void;
};

export function NewWorkspaceModal({
  opened,
  onCreate,
  onClose,
}: NewWorkspaceModalProps) {
  return (
    <Modal
      title={t`Create a workspace`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <NewWorkspaceForm onCreate={onCreate} onClose={onClose} />
    </Modal>
  );
}

type NewWorkspaceFormValues = {
  name: string;
};

const NEW_WORKSPACE_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
});

const INITIAL_VALUES: NewWorkspaceFormValues = {
  name: "",
};

type NewWorkspaceFormProps = {
  onCreate: (workspace: Workspace) => void;
  onClose: () => void;
};

function NewWorkspaceForm({ onCreate, onClose }: NewWorkspaceFormProps) {
  const [createWorkspace] = useCreateWorkspaceMutation();

  const handleSubmit = async ({ name }: NewWorkspaceFormValues) => {
    const workspace = await createWorkspace({ name }).unwrap();
    onCreate(workspace);
  };

  return (
    <FormProvider
      initialValues={INITIAL_VALUES}
      validationSchema={NEW_WORKSPACE_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <FormTextInput
            name="name"
            label={t`Name`}
            placeholder={t`My workspace`}
            data-autofocus
          />
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Create`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
