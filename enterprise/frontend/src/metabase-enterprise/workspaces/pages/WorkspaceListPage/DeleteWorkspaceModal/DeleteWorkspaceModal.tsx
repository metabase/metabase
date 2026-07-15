import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
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
import type { Workspace, WorkspaceId } from "metabase-types/api";

import { getWorkspaceDatabaseName, isPending } from "../../../utils";

export type DeleteWorkspaceModalProps = {
  workspaceId: WorkspaceId;
  onDelete: () => void;
  onClose: () => void;
};

export function DeleteWorkspaceModal({
  workspaceId,
  onDelete,
  onClose,
}: DeleteWorkspaceModalProps) {
  return (
    <Modal
      title={t`Delete this workspace?`}
      opened
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <DeleteWorkspaceLoader
        workspaceId={workspaceId}
        onDelete={onDelete}
        onClose={onClose}
      />
    </Modal>
  );
}

type DeleteWorkspaceLoaderProps = {
  workspaceId: WorkspaceId;
  onDelete: () => void;
  onClose: () => void;
};

function DeleteWorkspaceLoader({
  workspaceId,
  onDelete,
  onClose,
}: DeleteWorkspaceLoaderProps) {
  // The list page omits databases, so fetch the hydrated workspace to learn which
  // databases are still provisioning/deprovisioning.
  const {
    data: workspace,
    isLoading,
    error,
  } = useGetWorkspaceQuery(workspaceId);

  if (isLoading || error != null || workspace == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <DeleteWorkspaceForm
      workspace={workspace}
      onDelete={onDelete}
      onClose={onClose}
    />
  );
}

type DeleteWorkspaceFormProps = {
  workspace: Workspace;
  onDelete: () => void;
  onClose: () => void;
};

function DeleteWorkspaceForm({
  workspace,
  onDelete,
  onClose,
}: DeleteWorkspaceFormProps) {
  const [deleteWorkspace] = useDeleteWorkspaceMutation();
  const databases = workspace.databases ?? [];
  const pendingDatabases = databases.filter(isPending);
  const hasPendingDatabases = pendingDatabases.length > 0;

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
                    {getWorkspaceDatabaseName(workspaceDatabase)}
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
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
