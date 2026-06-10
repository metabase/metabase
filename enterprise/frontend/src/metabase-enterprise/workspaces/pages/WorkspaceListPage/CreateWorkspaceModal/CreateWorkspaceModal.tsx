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

import { trackWorkspaceCreated } from "../../../analytics";

type CreateWorkspaceModalProps = {
  opened: boolean;
  onCreate: (workspace: Workspace) => void;
  onClose: () => void;
};

export function CreateWorkspaceModal({
  opened,
  onCreate,
  onClose,
}: CreateWorkspaceModalProps) {
  return (
    <Modal
      title={t`Create a new branch for this workspace`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <CreateWorkspaceForm onCreate={onCreate} onClose={onClose} />
    </Modal>
  );
}

type CreateWorkspaceFormValues = {
  name: string;
};

const CREATE_WORKSPACE_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
});

const INITIAL_VALUES: CreateWorkspaceFormValues = {
  name: "",
};

type CreateWorkspaceFormProps = {
  onCreate: (workspace: Workspace) => void;
  onClose: () => void;
};

function CreateWorkspaceForm({ onCreate, onClose }: CreateWorkspaceFormProps) {
  const [createWorkspace] = useCreateWorkspaceMutation();

  const handleSubmit = async ({ name }: CreateWorkspaceFormValues) => {
    const workspace = await createWorkspace({ name }).unwrap();
    trackWorkspaceCreated({ workspaceId: workspace.id });
    onCreate(workspace);
  };

  return (
    <FormProvider
      initialValues={INITIAL_VALUES}
      validationSchema={CREATE_WORKSPACE_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <FormTextInput
            name="name"
            aria-label={t`Name`}
            placeholder={t`My workspace`}
            data-autofocus
          />
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Create workspace`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
