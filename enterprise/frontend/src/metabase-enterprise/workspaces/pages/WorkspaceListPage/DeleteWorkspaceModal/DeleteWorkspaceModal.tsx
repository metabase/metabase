import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import {
  Button,
  FocusTrap,
  Group,
  List,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import {
  useDeleteWorkspaceMutation,
  useGetWorkspaceQuery,
} from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import { isPending } from "../../../utils";

export type DeleteWorkspaceModalProps = {
  workspace: Workspace;
  opened: boolean;
  onDelete: () => void;
  onClose: () => void;
};

export function DeleteWorkspaceModal({
  workspace,
  opened,
  onDelete,
  onClose,
}: DeleteWorkspaceModalProps) {
  return (
    <Modal
      title={t`Delete this workspace?`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <DeleteWorkspaceForm
        workspace={workspace}
        opened={opened}
        onDelete={onDelete}
        onClose={onClose}
      />
    </Modal>
  );
}

type DeleteWorkspaceFormProps = {
  workspace: Workspace;
  opened: boolean;
  onDelete: () => void;
  onClose: () => void;
};

function DeleteWorkspaceForm({
  workspace,
  opened,
  onDelete,
  onClose,
}: DeleteWorkspaceFormProps) {
  const [deleteWorkspace] = useDeleteWorkspaceMutation();
  // The list page omits databases, so fetch the hydrated workspace to learn which
  // databases are still provisioning/deprovisioning. Skipped while the modal is closed.
  const { data: hydratedWorkspace, isLoading } = useGetWorkspaceQuery(
    workspace.id,
    { skip: !opened },
  );

  const pendingDatabases = (hydratedWorkspace?.databases ?? []).filter(
    isPending,
  );
  const hasPendingDatabases = pendingDatabases.length > 0;

  // On teardown failure the backend keeps the workspace and responds with an
  // error, which the form surfaces; the delete can simply be retried.
  const handleSubmit = async () => {
    await deleteWorkspace(workspace.id).unwrap();
    onDelete();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack gap="lg">
          {hasPendingDatabases ? (
            <Stack gap="sm">
              <Text>
                {t`Some of this workspace's databases are still being set up or torn down. Deleting will wait for that work to finish, then remove the workspace along with its temporary database users and schemas:`}
              </Text>
              <List>
                {pendingDatabases.map((workspaceDatabase) => (
                  <List.Item key={workspaceDatabase.database_id}>
                    {workspaceDatabase.database?.name ??
                      t`Database ${workspaceDatabase.database_id}`}
                  </List.Item>
                ))}
              </List>
            </Stack>
          ) : (
            <Text>
              {t`This will delete the workspace as well as the temporary database users and schemas that were created for this workspace. This can't be undone.`}
            </Text>
          )}
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={t`Delete workspace`}
              variant="filled"
              color="feedback-negative"
              disabled={isLoading}
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
