import { useMemo } from "react";
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
  FixedSizeIcon,
  FocusTrap,
  Group,
  Input,
  Modal,
  Radio,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { useCreateWorkspaceDatabaseMutation } from "metabase-enterprise/api";
import type { Database, DatabaseId, Workspace } from "metabase-types/api";

import { supportsWorkspaces } from "../../../../utils";
import { SchemaMultiSelect } from "../SchemaMultiSelect";

export type NewDatabaseModalProps = {
  workspace: Workspace;
  availableDatabases: Database[];
  opened: boolean;
  onCreate: (workspace: Workspace) => void;
  onClose: () => void;
};

export function NewDatabaseModal({
  workspace,
  availableDatabases,
  opened,
  onCreate,
  onClose,
}: NewDatabaseModalProps) {
  return (
    <Modal
      title={t`Add a database to this workspace`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <NewDatabaseForm
        workspace={workspace}
        availableDatabases={availableDatabases}
        onCreate={onCreate}
        onClose={onClose}
      />
    </Modal>
  );
}

type NewDatabaseFormValues = {
  database_id: DatabaseId | null;
  input_schemas: string[];
};

function getValidationSchema(availableDatabases: Database[]) {
  return Yup.object({
    database_id: Yup.number().nullable().required(Errors.required),
    input_schemas: Yup.array()
      .of(Yup.string().required())
      .when("database_id", {
        is: (databaseId: DatabaseId | null | undefined) => {
          if (databaseId == null) {
            return false;
          }
          const database = availableDatabases.find(
            (db) => db.id === databaseId,
          );
          return database != null && hasFeature(database, "schemas");
        },
        then: (schema) => schema.min(1, Errors.required).required(),
        otherwise: (schema) => schema.required(),
      }),
  });
}

type NewDatabaseFormProps = {
  workspace: Workspace;
  availableDatabases: Database[];
  onCreate: (workspace: Workspace) => void;
  onClose: () => void;
};

function NewDatabaseForm({
  workspace,
  availableDatabases,
  onCreate,
  onClose,
}: NewDatabaseFormProps) {
  const [createWorkspaceDatabase] = useCreateWorkspaceDatabaseMutation();

  const initialValues: NewDatabaseFormValues = {
    database_id: availableDatabases.find(supportsWorkspaces)?.id ?? null,
    input_schemas: [],
  };

  const validationSchema = useMemo(
    () => getValidationSchema(availableDatabases),
    [availableDatabases],
  );

  const handleSubmit = async (values: NewDatabaseFormValues) => {
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
      validationSchema={validationSchema}
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
              <DatabaseInput
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

type DatabaseInputProps = {
  databases: Database[];
  value: DatabaseId | null;
  onChange: (databaseId: DatabaseId | null) => void;
};

function DatabaseInput({ databases, value, onChange }: DatabaseInputProps) {
  if (databases.length === 1) {
    return (
      <Input.Wrapper label={t`Database`}>
        <Text>{databases[0].name}</Text>
      </Input.Wrapper>
    );
  }

  return (
    <Radio.Group
      label={t`Database`}
      value={value != null ? String(value) : null}
      onChange={(newValue) =>
        onChange(newValue != null ? Number(newValue) : null)
      }
    >
      <Stack gap="sm">
        {databases.map((database) => (
          <Radio
            key={database.id}
            value={String(database.id)}
            label={<DatabaseLabel database={database} />}
            disabled={!supportsWorkspaces(database)}
          />
        ))}
      </Stack>
    </Radio.Group>
  );
}

type DatabaseLabelProps = {
  database: Database;
};

function DatabaseLabel({ database }: DatabaseLabelProps) {
  if (supportsWorkspaces(database)) {
    return <>{database.name}</>;
  }
  return (
    <Group gap="xs" wrap="nowrap" component="span">
      <span>{database.name}</span>
      <Tooltip label={t`This database does not support workspaces.`}>
        <FixedSizeIcon name="info" c="text-secondary" />
      </Tooltip>
    </Group>
  );
}
