import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import { useUpdateWorkspaceDatabaseMutation } from "metabase-enterprise/api";
import type {
  Database,
  Workspace,
  WorkspaceDatabase,
} from "metabase-types/api";

import { SchemaMultiSelect } from "../SchemaMultiSelect";

export type UpdateWorkspaceDatabaseModalProps = {
  workspace: Workspace;
  workspaceDatabase: WorkspaceDatabase;
  database: Database;
  opened: boolean;
  onUpdate: (workspace: Workspace) => void;
  onClose: () => void;
};

export function UpdateWorkspaceDatabaseModal({
  workspace,
  workspaceDatabase,
  database,
  opened,
  onUpdate,
  onClose,
}: UpdateWorkspaceDatabaseModalProps) {
  return (
    <Modal
      title={t`Edit settings for ${database.name}`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <UpdateWorkspaceDatabaseForm
        workspace={workspace}
        workspaceDatabase={workspaceDatabase}
        onUpdate={onUpdate}
        onClose={onClose}
      />
    </Modal>
  );
}

type UpdateWorkspaceDatabaseFormValues = {
  input_schemas: string[];
};

const UPDATE_WORKSPACE_DATABASE_SCHEMA = Yup.object({
  input_schemas: Yup.array().of(Yup.string().required()).required(),
});

type UpdateWorkspaceDatabaseFormProps = {
  workspace: Workspace;
  workspaceDatabase: WorkspaceDatabase;
  onUpdate: (workspace: Workspace) => void;
  onClose: () => void;
};

function UpdateWorkspaceDatabaseForm({
  workspace,
  workspaceDatabase,
  onUpdate,
  onClose,
}: UpdateWorkspaceDatabaseFormProps) {
  const [updateWorkspaceDatabase] = useUpdateWorkspaceDatabaseMutation();

  const initialValues: UpdateWorkspaceDatabaseFormValues = {
    input_schemas: workspaceDatabase.input_schemas,
  };

  const handleSubmit = async (values: UpdateWorkspaceDatabaseFormValues) => {
    const updated = await updateWorkspaceDatabase({
      id: workspace.id,
      database_id: workspaceDatabase.database_id,
      input_schemas: values.input_schemas,
    }).unwrap();
    onUpdate(updated);
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={UPDATE_WORKSPACE_DATABASE_SCHEMA}
      onSubmit={handleSubmit}
    >
      {({ values, setFieldValue, dirty }) => (
        <Form>
          <Stack gap="lg">
            <Text>
              {t`Changing these settings will first delete the temporary user and schema, then recreate them with your new settings.`}
            </Text>
            <SchemaMultiSelect
              databaseId={workspaceDatabase.database_id}
              value={values.input_schemas}
              onChange={(schemas) => setFieldValue("input_schemas", schemas)}
            />
            <FormErrorMessage />
            <Group justify="flex-end">
              <Button onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton
                label={t`Save changes`}
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
