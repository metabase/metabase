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

type DatabaseMappingFormValues = {
  database_id: string | null;
  input_schemas: string[];
};

function getValidationSchema(databases: Database[]) {
  return Yup.object({
    database_id: Yup.string().required(Errors.required),
    input_schemas: Yup.array()
      .of(Yup.string().required())
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

type DatabaseMappingModalProps = {
  mapping?: WorkspaceDatabase;
  databases: Database[];
  opened: boolean;
  readOnly?: boolean;
  onSubmit: (mapping: WorkspaceDatabase) => void;
  onDelete?: (mapping: WorkspaceDatabase) => void;
  onClose: () => void;
};

export function DatabaseMappingModal({
  mapping,
  databases,
  opened,
  readOnly = false,
  onSubmit,
  onDelete,
  onClose,
}: DatabaseMappingModalProps) {
  const isNew = mapping == null;

  return (
    <Modal
      title={isNew ? t`Add database` : t`Edit database mapping`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <DatabaseMappingForm
        mapping={mapping}
        databases={databases}
        readOnly={readOnly}
        onSubmit={onSubmit}
        onDelete={onDelete}
        onClose={onClose}
      />
    </Modal>
  );
}

type DatabaseMappingFormProps = {
  mapping?: WorkspaceDatabase;
  databases: Database[];
  readOnly: boolean;
  onSubmit: (mapping: WorkspaceDatabase) => void;
  onDelete?: (mapping: WorkspaceDatabase) => void;
  onClose: () => void;
};

function DatabaseMappingForm({
  mapping,
  databases,
  readOnly,
  onSubmit,
  onDelete,
  onClose,
}: DatabaseMappingFormProps) {
  const isNew = mapping == null;
  const initialValues = useMemo(() => getInitialValues(mapping), [mapping]);
  const validationSchema = useMemo(
    () => getValidationSchema(databases),
    [databases],
  );

  const handleSubmit = (values: DatabaseMappingFormValues) => {
    onSubmit(getDatabaseMapping(values));
    onClose();
  };

  const handleDelete = () => {
    if (mapping != null) {
      onDelete?.(mapping);
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
                    label={t`Unprovision this workspace before editing.`}
                    disabled={!readOnly}
                    openDelay={TOOLTIP_OPEN_DELAY}
                  >
                    <Button
                      variant="subtle"
                      color="error"
                      disabled={readOnly}
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
                  label={t`Unprovision this workspace before editing.`}
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
  mapping?: WorkspaceDatabase,
): DatabaseMappingFormValues {
  if (mapping == null) {
    return {
      database_id: null,
      input_schemas: [],
    };
  }

  return {
    database_id: getDatabaseValue(mapping.database_id),
    input_schemas: mapping.input_schemas,
  };
}

function getDatabaseMapping(
  values: DatabaseMappingFormValues,
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
