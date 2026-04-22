import { t } from "ttag";
import * as Yup from "yup";

import { skipToken, useListDatabaseSchemasQuery } from "metabase/api";
import {
  Form,
  FormErrorMessage,
  FormMultiSelect,
  FormProvider,
  FormSelect,
  FormSubmitButton,
} from "metabase/forms";
import { Box, Button, Group, Modal, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import type {
  Database,
  DatabaseId,
  WorkspaceDatabaseDraft,
} from "metabase-types/api";

type DatabaseMappingFormValues = {
  database_id: string;
  input_schemas: string[];
};

const VALIDATION_SCHEMA = Yup.object({
  database_id: Yup.string().required(Errors.required),
  input_schemas: Yup.array()
    .of(Yup.string().required())
    .min(1, Errors.required)
    .required(),
});

type DatabaseMappingModalProps = {
  mapping?: WorkspaceDatabaseDraft;
  databases: Database[];
  onSubmit: (mapping: WorkspaceDatabaseDraft) => void;
  onDelete?: (mapping: WorkspaceDatabaseDraft) => void;
  onClose: () => void;
};

export function DatabaseMappingModal({
  mapping,
  databases,
  onSubmit,
  onDelete,
  onClose,
}: DatabaseMappingModalProps) {
  const isNew = mapping == null;

  return (
    <Modal
      title={isNew ? t`Add database` : t`Edit database`}
      opened
      padding="xl"
      onClose={onClose}
    >
      <DatabaseMappingForm
        mapping={mapping}
        databases={databases}
        onSubmit={onSubmit}
        onDelete={onDelete}
        onClose={onClose}
      />
    </Modal>
  );
}

type DatabaseMappingFormProps = {
  mapping?: WorkspaceDatabaseDraft;
  databases: Database[];
  onSubmit: (mapping: WorkspaceDatabaseDraft) => void;
  onDelete?: (mapping: WorkspaceDatabaseDraft) => void;
  onClose: () => void;
};

function DatabaseMappingForm({
  mapping,
  databases,
  onSubmit,
  onDelete,
  onClose,
}: DatabaseMappingFormProps) {
  const isNew = mapping == null;
  const canDelete = !isNew && onDelete != null;

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
      initialValues={getInitialValues(mapping)}
      validationSchema={VALIDATION_SCHEMA}
      onSubmit={handleSubmit}
    >
      {({ values, setFieldValue }) => {
        const databaseId = values.database_id
          ? getDatabaseId(values.database_id)
          : null;

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
                onChange={handleDatabaseChange}
              />
              {databaseId != null && (
                <DatabaseSchemasSelect databaseId={databaseId} />
              )}
              <Group>
                {canDelete && (
                  <Button variant="subtle" color="error" onClick={handleDelete}>
                    {t`Delete`}
                  </Button>
                )}
                <Box flex={1}>
                  <FormErrorMessage />
                </Box>
                <Button onClick={onClose}>{t`Cancel`}</Button>
                <FormSubmitButton
                  label={isNew ? t`Add database` : t`Save`}
                  variant="filled"
                />
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
};

function DatabaseSchemasSelect({ databaseId }: DatabaseSchemasSelectProps) {
  const { data: schemas = [] } = useListDatabaseSchemasQuery(
    databaseId != null ? { id: databaseId, include_hidden: true } : skipToken,
  );

  return (
    <FormMultiSelect
      name="input_schemas"
      label={t`Schemas`}
      description={t`Tables in these schemas will be readable when this workspace is used.`}
      placeholder={t`Select schemas`}
      data={schemas}
      searchable
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
  mapping?: WorkspaceDatabaseDraft,
): DatabaseMappingFormValues {
  return {
    database_id:
      mapping?.database_id != null ? getDatabaseValue(mapping.database_id) : "",
    input_schemas: mapping?.input_schemas ?? [],
  };
}

function getDatabaseMapping(
  values: DatabaseMappingFormValues,
): WorkspaceDatabaseDraft {
  return {
    database_id: getDatabaseId(values.database_id),
    input_schemas: values.input_schemas,
  };
}
