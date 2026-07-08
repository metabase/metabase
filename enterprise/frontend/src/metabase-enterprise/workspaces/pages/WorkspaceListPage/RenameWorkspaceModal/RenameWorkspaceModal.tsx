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
import { useUpdateWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

export type RenameWorkspaceModalProps = {
  workspace: Workspace;
  opened: boolean;
  onRename: (workspace: Workspace) => void;
  onClose: () => void;
};

export function RenameWorkspaceModal({
  workspace,
  opened,
  onRename,
  onClose,
}: RenameWorkspaceModalProps) {
  return (
    <Modal
      title={t`Rename this workspace?`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <RenameWorkspaceForm
        workspace={workspace}
        onRename={onRename}
        onClose={onClose}
      />
    </Modal>
  );
}

type RenameWorkspaceFormValues = {
  name: string;
};

const RENAME_WORKSPACE_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
});

type RenameWorkspaceFormProps = {
  workspace: Workspace;
  onRename: (workspace: Workspace) => void;
  onClose: () => void;
};

function RenameWorkspaceForm({
  workspace,
  onRename,
  onClose,
}: RenameWorkspaceFormProps) {
  const [updateWorkspace] = useUpdateWorkspaceMutation();

  const handleSubmit = async ({ name }: RenameWorkspaceFormValues) => {
    const updatedWorkspace = await updateWorkspace({
      id: workspace.id,
      name,
    }).unwrap();
    onRename(updatedWorkspace);
  };

  return (
    <FormProvider
      initialValues={{ name: workspace.name }}
      validationSchema={RENAME_WORKSPACE_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <FormTextInput name="name" label={t`Name`} data-autofocus />
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Rename`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
