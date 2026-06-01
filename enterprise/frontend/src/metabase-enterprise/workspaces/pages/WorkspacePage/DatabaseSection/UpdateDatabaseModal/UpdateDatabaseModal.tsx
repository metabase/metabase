import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import {
  useLazyGetWorkspaceQuery,
  useUpdateWorkspaceDatabaseMutation,
} from "metabase-enterprise/api";
import type {
  Database,
  Workspace,
  WorkspaceDatabase,
} from "metabase-types/api";

import { SchemaMultiSelect } from "../SchemaMultiSelect";

export type UpdateDatabaseModalProps = {
  workspace: Workspace;
  workspaceDatabase: WorkspaceDatabase;
  database: Database;
  opened: boolean;
  onUpdate: (workspace: Workspace) => void;
  onClose: () => void;
};

export function UpdateDatabaseModal({
  workspace,
  workspaceDatabase,
  database,
  opened,
  onUpdate,
  onClose,
}: UpdateDatabaseModalProps) {
  return (
    <Modal
      title={t`Edit settings for ${database.name}`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <UpdateDatabaseForm
        workspace={workspace}
        workspaceDatabase={workspaceDatabase}
        onUpdate={onUpdate}
        onClose={onClose}
      />
    </Modal>
  );
}

type UpdateDatabaseFormValues = {
  input_schemas: string[];
};

const UPDATE_DATABASE_SCHEMA = Yup.object({
  input_schemas: Yup.array().of(Yup.string().required()).required(),
});

type UpdateDatabaseFormProps = {
  workspace: Workspace;
  workspaceDatabase: WorkspaceDatabase;
  onUpdate: (workspace: Workspace) => void;
  onClose: () => void;
};

function UpdateDatabaseForm({
  workspace,
  workspaceDatabase,
  onUpdate,
  onClose,
}: UpdateDatabaseFormProps) {
  const [updateWorkspaceDatabase] = useUpdateWorkspaceDatabaseMutation();
  const [getWorkspace] = useLazyGetWorkspaceQuery();

  const initialValues: UpdateDatabaseFormValues = {
    input_schemas: workspaceDatabase.input_schemas,
  };

  const handleSubmit = async (values: UpdateDatabaseFormValues) => {
    const updated = await updateWorkspaceDatabase({
      id: workspace.id,
      database_id: workspaceDatabase.database_id,
      input_schemas: values.input_schemas,
    }).unwrap();
    await getWorkspace(workspace.id).unwrap();
    onUpdate(updated);
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={UPDATE_DATABASE_SCHEMA}
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
