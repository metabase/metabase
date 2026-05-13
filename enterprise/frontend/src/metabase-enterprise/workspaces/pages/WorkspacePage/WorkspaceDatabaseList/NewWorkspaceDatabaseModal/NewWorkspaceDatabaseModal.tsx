import { t } from "ttag";
import * as Yup from "yup";

import { hasFeature } from "metabase/common/utils/database";
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
  Modal,
  Radio,
  Stack,
  Text,
} from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { useCreateWorkspaceDatabaseMutation } from "metabase-enterprise/api";
import type { Database, DatabaseId, Workspace } from "metabase-types/api";

import { SchemaMultiSelect } from "../SchemaMultiSelect";

export type NewWorkspaceDatabaseModalProps = {
  workspace: Workspace;
  availableDatabases: Database[];
  opened: boolean;
  onCreate: (workspace: Workspace) => void;
  onClose: () => void;
};

export function NewWorkspaceDatabaseModal({
  workspace,
  availableDatabases,
  opened,
  onCreate,
  onClose,
}: NewWorkspaceDatabaseModalProps) {
  return (
    <Modal
      title={t`Add a database to this workspace`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <NewWorkspaceDatabaseForm
        workspace={workspace}
        availableDatabases={availableDatabases}
        onCreate={onCreate}
        onClose={onClose}
      />
    </Modal>
  );
}

type NewWorkspaceDatabaseFormValues = {
  database_id: DatabaseId | null;
  input_schemas: string[];
};

const NEW_WORKSPACE_DATABASE_SCHEMA = Yup.object({
  database_id: Yup.number().nullable().required(Errors.required),
  input_schemas: Yup.array().of(Yup.string().required()).required(),
});

type NewWorkspaceDatabaseFormProps = {
  workspace: Workspace;
  availableDatabases: Database[];
  onCreate: (workspace: Workspace) => void;
  onClose: () => void;
};

function NewWorkspaceDatabaseForm({
  workspace,
  availableDatabases,
  onCreate,
  onClose,
}: NewWorkspaceDatabaseFormProps) {
  const [createWorkspaceDatabase] = useCreateWorkspaceDatabaseMutation();

  const initialValues: NewWorkspaceDatabaseFormValues = {
    database_id: availableDatabases[0]?.id ?? null,
    input_schemas: [],
  };

  const handleSubmit = async (values: NewWorkspaceDatabaseFormValues) => {
    if (values.database_id == null) {
      return;
    }
    const updated = await createWorkspaceDatabase({
      id: workspace.id,
      database_id: values.database_id,
      input_schemas: values.input_schemas,
    }).unwrap();
    onCreate(updated);
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={NEW_WORKSPACE_DATABASE_SCHEMA}
      onSubmit={handleSubmit}
    >
      {({ values, setFieldValue }) => {
        const selectedDatabase = availableDatabases.find(
          (database) => database.id === values.database_id,
        );
        const supportsSchemas =
          selectedDatabase != null && hasFeature(selectedDatabase, "schemas");

        return (
          <Form>
            <Stack gap="lg">
              <Text>
                {t`This will create a temporary schema and user in this database, grant that user read access to the schemas you select, and write access to the temporary schema.`}
              </Text>
              <DatabaseRadioGroup
                databases={availableDatabases}
                value={values.database_id}
                onChange={(databaseId) => {
                  setFieldValue("database_id", databaseId);
                  setFieldValue("input_schemas", []);
                }}
              />
              {values.database_id != null && supportsSchemas && (
                <SchemaMultiSelect
                  databaseId={values.database_id}
                  value={values.input_schemas}
                  onChange={(schemas) =>
                    setFieldValue("input_schemas", schemas)
                  }
                />
              )}
              <FormErrorMessage />
              <Group justify="flex-end">
                <Button onClick={onClose}>{t`Cancel`}</Button>
                <FormSubmitButton label={t`Add database`} variant="filled" />
              </Group>
            </Stack>
          </Form>
        );
      }}
    </FormProvider>
  );
}

type DatabaseRadioGroupProps = {
  databases: Database[];
  value: DatabaseId | null;
  onChange: (databaseId: DatabaseId | null) => void;
};

function DatabaseRadioGroup({
  databases,
  value,
  onChange,
}: DatabaseRadioGroupProps) {
  return (
    <Radio.Group
      label={t`Database`}
      value={value != null ? String(value) : null}
      onChange={(newValue) =>
        onChange(newValue != null ? Number(newValue) : null)
      }
    >
      <Stack>
        {databases.map((database) => (
          <Radio
            key={database.id}
            value={String(database.id)}
            label={database.name}
          />
        ))}
      </Stack>
    </Radio.Group>
  );
}
