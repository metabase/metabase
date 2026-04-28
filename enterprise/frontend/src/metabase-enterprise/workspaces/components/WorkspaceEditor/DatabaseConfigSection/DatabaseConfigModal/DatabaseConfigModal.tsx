import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { hasFeature } from "metabase/admin/databases/utils";
import { useListDatabaseSchemasQuery } from "metabase/api";
import {
  Form,
  FormErrorMessage,
  FormMultiSelect,
  FormProvider,
  FormSelect,
  FormSubmitButton,
} from "metabase/forms";
import { Box, Button, Group, Modal, Stack, Tooltip } from "metabase/ui";
import { TOOLTIP_OPEN_DELAY } from "metabase/utils/constants";
import * as Errors from "metabase/utils/errors";
import type {
  Database,
  DatabaseId,
  WorkspaceDatabase,
} from "metabase-types/api";

type DatabaseConfigFormValues = {
  database_id: string | null;
  input_schemas: string[];
};

function getValidationSchema(databases: Database[]) {
  return Yup.object({
    database_id: Yup.string().required(Errors.required),
    input_schemas: Yup.array()
      .of(Yup.string().nullable().required())
      .when("database_id", {
        is: (value: string) => {
          const databaseId = getDatabaseId(value);
          const database = databases.find(
            (database) => database.id === databaseId,
          );
          return database != null && hasFeature(database, "schemas");
        },
        then: (schema) => schema.min(1, Errors.required).required(),
        otherwise: (schema) => schema,
      }),
  });
}

type DatabaseConfigModalProps = {
  config?: WorkspaceDatabase;
  databases: Database[];
  opened: boolean;
  readOnly?: boolean;
  canRemove?: boolean;
  onSubmit: (config: WorkspaceDatabase) => void;
  onDelete?: (config: WorkspaceDatabase) => void;
  onClose: () => void;
};

export function DatabaseConfigModal({
  config,
  databases,
  opened,
  readOnly = false,
  canRemove = false,
  onSubmit,
  onDelete,
  onClose,
}: DatabaseConfigModalProps) {
  const isNew = config == null;

  return (
    <Modal
      title={isNew ? t`Add database` : t`Edit database configuration`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <DatabaseConfigForm
        config={config}
        databases={databases}
        readOnly={readOnly}
        canRemove={canRemove}
        onSubmit={onSubmit}
        onDelete={onDelete}
        onClose={onClose}
      />
    </Modal>
  );
}

type DatabaseConfigFormProps = {
  config?: WorkspaceDatabase;
  databases: Database[];
  readOnly: boolean;
  canRemove: boolean;
  onSubmit: (config: WorkspaceDatabase) => void;
  onDelete?: (config: WorkspaceDatabase) => void;
  onClose: () => void;
};

function DatabaseConfigForm({
  config,
  databases,
  readOnly,
  canRemove,
  onSubmit,
  onDelete,
  onClose,
}: DatabaseConfigFormProps) {
  const isNew = config == null;
  const initialValues = useMemo(() => getInitialValues(config), [config]);
  const validationSchema = useMemo(
    () => getValidationSchema(databases),
    [databases],
  );

  const handleSubmit = (values: DatabaseConfigFormValues) => {
    onSubmit(getDatabaseConfig(values));
    onClose();
  };

  const handleDelete = () => {
    if (config != null) {
      onDelete?.(config);
      onClose();
    }
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={handleSubmit}
    >
      {({ values, setFieldValue, dirty }) => {
        const databaseId = values.database_id
          ? getDatabaseId(values.database_id)
          : null;
        const database = databases.find(
          (database) => database.id === databaseId,
        );
        const hasSchemas = database != null && hasFeature(database, "schemas");

        const handleDatabaseChange = (value: string) => {
          setFieldValue("database_id", value);
          setFieldValue("input_schemas", []);
        };

        return (
          <Form>
            <Stack gap="lg">
              <FormSelect
                name="database_id"
                label={t`Database`}
                placeholder={t`Select a database`}
                data={getDatabaseOptions(databases)}
                searchable
                readOnly={readOnly}
                onChange={handleDatabaseChange}
              />
              {databaseId != null && hasSchemas && (
                <DatabaseSchemasSelect
                  databaseId={databaseId}
                  selectedSchemas={values.input_schemas}
                  readOnly={readOnly}
                />
              )}
              <Group>
                {!isNew && (
                  <Tooltip
                    label={
                      readOnly
                        ? t`Deprovision this workspace before editing.`
                        : t`A workspace must have at least one database.`
                    }
                    disabled={canRemove}
                    openDelay={TOOLTIP_OPEN_DELAY}
                  >
                    <Button
                      variant="subtle"
                      color="error"
                      disabled={!canRemove}
                      onClick={handleDelete}
                    >
                      {t`Delete`}
                    </Button>
                  </Tooltip>
                )}
                <Box flex={1}>
                  <FormErrorMessage />
                </Box>
                <Button onClick={onClose}>{t`Cancel`}</Button>
                <Tooltip
                  label={t`Deprovision this workspace before editing.`}
                  disabled={!readOnly}
                  openDelay={TOOLTIP_OPEN_DELAY}
                >
                  <FormSubmitButton
                    label={isNew ? t`Add database` : t`Save`}
                    variant="filled"
                    disabled={readOnly || (!isNew && !dirty)}
                  />
                </Tooltip>
              </Group>
            </Stack>
          </Form>
        );
      }}
    </FormProvider>
  );
}

type DatabaseSchemasSelectProps = {
  databaseId: DatabaseId;
  selectedSchemas: string[];
  readOnly: boolean;
};

function DatabaseSchemasSelect({
  databaseId,
  selectedSchemas,
  readOnly,
}: DatabaseSchemasSelectProps) {
  const { data: availableSchemas = [] } = useListDatabaseSchemasQuery({
    id: databaseId,
    include_hidden: true,
  });
  const isAllSelected =
    availableSchemas.length > 0 &&
    selectedSchemas.length === availableSchemas.length;

  return (
    <FormMultiSelect
      name="input_schemas"
      label={t`Schemas`}
      description={t`Tables in these schemas are readable in this workspace.`}
      placeholder={isAllSelected ? t`All schemas selected` : t`Select schemas`}
      data={availableSchemas}
      searchable
      readOnly={readOnly}
    />
  );
}

function getDatabaseValue(databaseId: DatabaseId): string {
  return String(databaseId);
}

function getDatabaseId(value: string): DatabaseId {
  return Number(value);
}

function getDatabaseOptions(databases: Database[]) {
  return databases.map((database) => ({
    value: getDatabaseValue(database.id),
    label: database.name,
  }));
}

function getInitialValues(
  config?: WorkspaceDatabase,
): DatabaseConfigFormValues {
  if (config == null) {
    return {
      database_id: null,
      input_schemas: [],
    };
  }

  return {
    database_id: getDatabaseValue(config.database_id),
    input_schemas: config.input_schemas,
  };
}

function getDatabaseConfig(
  values: DatabaseConfigFormValues,
): WorkspaceDatabase {
  if (values.database_id == null) {
    throw new Error("Database ID is required");
  }

  return {
    database_id: getDatabaseId(values.database_id),
    input_schemas: values.input_schemas,
    output_schema: "",
    status: "unprovisioned",
  };
}
