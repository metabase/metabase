import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import {
  useDeleteWorkspaceDatabaseMutation,
  useLazyGetWorkspaceQuery,
} from "metabase-enterprise/api";
import type {
  Database,
  Workspace,
  WorkspaceDatabase,
} from "metabase-types/api";

export type DeleteDatabaseModalProps = {
  workspace: Workspace;
  workspaceDatabase: WorkspaceDatabase;
  database: Database | undefined;
  opened: boolean;
  onDelete: () => void;
  onClose: () => void;
};

export function DeleteDatabaseModal({
  workspace,
  workspaceDatabase,
  database,
  opened,
  onDelete,
  onClose,
}: DeleteDatabaseModalProps) {
  return (
    <Modal
      title={t`Remove ${database?.name} from this workspace?`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <DeleteDatabaseForm
        workspace={workspace}
        workspaceDatabase={workspaceDatabase}
        onDelete={onDelete}
        onClose={onClose}
      />
    </Modal>
  );
}

type DeleteDatabaseFormProps = {
  workspace: Workspace;
  workspaceDatabase: WorkspaceDatabase;
  onDelete: () => void;
  onClose: () => void;
};

function DeleteDatabaseForm({
  workspace,
  workspaceDatabase,
  onDelete,
  onClose,
}: DeleteDatabaseFormProps) {
  const [deleteWorkspaceDatabase] = useDeleteWorkspaceDatabaseMutation();
  const [getWorkspace] = useLazyGetWorkspaceQuery();

  const handleSubmit = async () => {
    await deleteWorkspaceDatabase({
      id: workspace.id,
      database_id: workspaceDatabase.database_id,
    }).unwrap();
    await getWorkspace(workspace.id).unwrap();
    onDelete();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack gap="lg">
          <Text>
            {t`This will delete the temporary user and schema from this database.`}
          </Text>
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={t`Remove`}
              variant="filled"
              color="danger"
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
