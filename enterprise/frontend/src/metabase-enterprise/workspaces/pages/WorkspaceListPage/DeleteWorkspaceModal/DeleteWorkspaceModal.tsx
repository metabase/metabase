import { t } from "ttag";

import { useToast } from "metabase/common/hooks/use-toast";
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
import type { Workspace, WorkspaceDatabase } from "metabase-types/api";

export type DeleteWorkspaceModalProps = {
  workspace: Workspace;
  opened: boolean;
  onDelete: () => void;
  onClose: () => void;
};

function isPending(workspaceDatabase: WorkspaceDatabase) {
  const { status } = workspaceDatabase;
  return status === "provisioning" || status === "deprovisioning";
}

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
  const [sendToast] = useToast();
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

  const handleSubmit = async () => {
    const result = await deleteWorkspace({
      id: workspace.id,
      ignorePending: hasPendingDatabases,
    }).unwrap();
    // The workspace is deleted even when warehouse teardown partly fails; warn the
    // admin so the leftover schema/user objects can be removed manually.
    if (result.orphaned_resources?.length) {
      sendToast({
        message: result.message,
        icon: "warning",
        toastColor: "error",
        timeout: null,
      });
    }
    onDelete();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack gap="lg">
          {hasPendingDatabases ? (
            <Stack gap="sm">
              <Text>
                {t`Some of this workspace's databases are still being set up or torn down. Deleting now will remove the workspace, but their temporary database users and schemas will be left in place and must be removed manually:`}
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
              color="danger"
              disabled={isLoading}
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
