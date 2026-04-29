import { useFormikContext } from "formik";
import { t } from "ttag";
import * as Yup from "yup";

import { hasFeature } from "metabase/admin/databases/utils";
import {
  skipToken,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import {
  Form,
  FormErrorMessage,
  FormMultiSelect,
  FormProvider,
  FormSelect,
  FormSubmitButton,
} from "metabase/forms";
import { Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import {
  useCreateWorkspaceDatabaseMutation,
  useDeleteWorkspaceDatabaseMutation,
  useUpdateWorkspaceDatabaseMutation,
} from "metabase-enterprise/api";
import type { Database, DatabaseId, Workspace } from "metabase-types/api";

type DatabaseValues = {
  databaseId: string | null;
  inputSchemas: string[];
};

const VALIDATION_SCHEMA = Yup.object({
  databaseId: Yup.string().nullable().required(Errors.required),
  inputSchemas: Yup.array()
    .of(Yup.string().required())
    .min(1, Errors.required)
    .required(Errors.required),
});

const INITIAL_VALUES: DatabaseValues = {
  databaseId: null,
  inputSchemas: [],
};

type CreateDatabaseModalProps = {
  workspace: Workspace;
  opened: boolean;
  onClose: () => void;
};

export function CreateDatabaseModal({
  workspace,
  opened,
  onClose,
}: CreateDatabaseModalProps) {
  return (
    <Modal
      title={t`Add database`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <CreateDatabaseForm workspace={workspace} onClose={onClose} />
    </Modal>
  );
}

type UpdateDatabaseModalProps = {
  workspace: Workspace;
  databaseId: DatabaseId;
  opened: boolean;
  onClose: () => void;
};

export function UpdateDatabaseModal({
  workspace,
  databaseId,
  opened,
  onClose,
}: UpdateDatabaseModalProps) {
  return (
    <Modal
      title={t`Edit database configuration`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <UpdateDatabaseForm
        workspace={workspace}
        databaseId={databaseId}
        onClose={onClose}
      />
    </Modal>
  );
}

type CreateDatabaseFormProps = {
  workspace: Workspace;
  onClose: () => void;
};

function CreateDatabaseForm({ workspace, onClose }: CreateDatabaseFormProps) {
  const { data: databasesResponse } = useListDatabasesQuery();
  const availableDatabases = databasesResponse?.data ?? [];
  const [createWorkspaceDatabase] = useCreateWorkspaceDatabaseMutation();

  const handleSubmit = async (values: DatabaseValues) => {
    if (values.databaseId == null) {
      return;
    }
    await createWorkspaceDatabase({
      workspace_id: workspace.id,
      database_id: getDatabaseId(values.databaseId),
      input_schemas: values.inputSchemas,
    }).unwrap();
    onClose();
  };

  return (
    <FormProvider
      initialValues={INITIAL_VALUES}
      validationSchema={VALIDATION_SCHEMA}
      onSubmit={handleSubmit}
    >
      {({ values }) => (
        <Form>
          <Stack gap="lg">
            <Text c="text-secondary">
              {t`Creates a temporary writable schema and a database user, then grants the user write access to that schema and read access to the selected schemas.`}
            </Text>
            <DatabaseSelect availableDatabases={availableDatabases} />
            <DatabaseSchemaSelect
              databaseId={
                values.databaseId ? getDatabaseId(values.databaseId) : null
              }
              inputSchemas={values.inputSchemas}
              availableDatabases={availableDatabases}
            />
            <FormErrorMessage />
            <Group justify="flex-end">
              <Button onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton label={t`Add database`} variant="filled" />
            </Group>
          </Stack>
        </Form>
      )}
    </FormProvider>
  );
}

type UpdateDatabaseFormProps = {
  workspace: Workspace;
  databaseId: DatabaseId;
  onClose: () => void;
};

function UpdateDatabaseForm({
  workspace,
  databaseId,
  onClose,
}: UpdateDatabaseFormProps) {
  const workspaceDatabase = workspace.databases.find(
    (db) => db.database_id === databaseId,
  );
  const { data: databasesResponse } = useListDatabasesQuery();
  const availableDatabases = databasesResponse?.data ?? [];
  const [updateWorkspaceDatabase] = useUpdateWorkspaceDatabaseMutation();
  const [deleteWorkspaceDatabase] = useDeleteWorkspaceDatabaseMutation();
  const { modalContent: confirmationContent, show: showConfirmation } =
    useConfirmation();

  if (workspaceDatabase == null) {
    return null;
  }

  const initialValues: DatabaseValues = {
    databaseId: getDatabaseValue(workspaceDatabase.database_id),
    inputSchemas: workspaceDatabase.input_schemas,
  };

  const handleSubmit = async (values: DatabaseValues) => {
    if (values.databaseId == null) {
      return;
    }
    await updateWorkspaceDatabase({
      workspace_id: workspace.id,
      database_id: getDatabaseId(values.databaseId),
      input_schemas: values.inputSchemas,
    }).unwrap();
    onClose();
  };

  const databaseName =
    availableDatabases.find((db) => db.id === databaseId)?.name ??
    t`this database`;

  const handleRemove = () => {
    showConfirmation({
      title: t`Remove ${databaseName} from this workspace?`,
      message: t`The writable schema and the database user in this database will be dropped. This cannot be undone.`,
      confirmButtonText: t`Remove`,
      confirmButtonProps: { variant: "filled", color: "error" },
      onConfirm: async () => {
        await deleteWorkspaceDatabase({
          workspace_id: workspace.id,
          database_id: databaseId,
        }).unwrap();
        onClose();
      },
    });
  };

  return (
    <>
      <FormProvider
        initialValues={initialValues}
        validationSchema={VALIDATION_SCHEMA}
        onSubmit={handleSubmit}
      >
        {({ values, dirty }) => (
          <Form>
            <Stack gap="lg">
              <Text c="text-secondary">
                {t`Saving will drop the existing writable schema and the database user, then create new ones.`}
              </Text>
              <DatabaseSelect availableDatabases={availableDatabases} />
              <DatabaseSchemaSelect
                databaseId={
                  values.databaseId ? getDatabaseId(values.databaseId) : null
                }
                inputSchemas={values.inputSchemas}
                availableDatabases={availableDatabases}
              />
              <FormErrorMessage />
              <Group justify="space-between">
                <Button variant="subtle" color="error" onClick={handleRemove}>
                  {t`Remove`}
                </Button>
                <Group>
                  <Button onClick={onClose}>{t`Cancel`}</Button>
                  <FormSubmitButton
                    label={t`Save`}
                    variant="filled"
                    disabled={!dirty}
                  />
                </Group>
              </Group>
            </Stack>
          </Form>
        )}
      </FormProvider>
      {confirmationContent}
    </>
  );
}

type DatabaseSelectProps = {
  availableDatabases: Database[];
};

function DatabaseSelect({ availableDatabases }: DatabaseSelectProps) {
  const { setFieldValue } = useFormikContext<DatabaseValues>();

  const handleChange = (value: string) => {
    setFieldValue("databaseId", value);
    setFieldValue("inputSchemas", []);
  };

  return (
    <FormSelect
      name="databaseId"
      label={t`Database`}
      placeholder={t`Select a database`}
      data={getDatabaseOptions(availableDatabases)}
      onChange={handleChange}
    />
  );
}

type DatabaseSchemaSelectProps = {
  databaseId: DatabaseId | null;
  inputSchemas: string[];
  availableDatabases: Database[];
};

function DatabaseSchemaSelect({
  databaseId,
  inputSchemas,
  availableDatabases,
}: DatabaseSchemaSelectProps) {
  const database = availableDatabases.find((db) => db.id === databaseId);
  const hasSchemas = database != null && hasFeature(database, "schemas");

  const { data: availableSchemas = [] } = useListDatabaseSchemasQuery(
    databaseId != null && hasSchemas
      ? { id: databaseId, include_hidden: true }
      : skipToken,
  );

  if (!hasSchemas) {
    return null;
  }

  const isAllSelected =
    availableSchemas.length > 0 &&
    inputSchemas.length === availableSchemas.length;

  return (
    <FormMultiSelect
      name="inputSchemas"
      label={t`Readable schemas`}
      placeholder={isAllSelected ? t`All schemas selected` : t`Select schemas`}
      data={availableSchemas}
      searchable
    />
  );
}

function getDatabaseId(value: string) {
  return Number(value);
}

function getDatabaseValue(databaseId: DatabaseId) {
  return String(databaseId);
}

function getDatabaseOptions(availableDatabases: Database[]) {
  return availableDatabases.map((database) => ({
    value: getDatabaseValue(database.id),
    label: database.name,
  }));
}
