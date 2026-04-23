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
import { Box, Button, Group, Modal, Stack, Tooltip } from "metabase/ui";
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
  opened: boolean;
  canDelete?: boolean;
  isReadOnly?: boolean;
  onSubmit: (mapping: WorkspaceDatabaseDraft) => void;
  onDelete?: (mapping: WorkspaceDatabaseDraft) => void;
  onClose: () => void;
};

export function DatabaseMappingModal({
  mapping,
  databases,
  opened,
  canDelete = true,
  isReadOnly = false,
  onSubmit,
  onDelete,
  onClose,
}: DatabaseMappingModalProps) {
  const isNew = mapping == null;

  return (
    <Modal
      title={isNew ? t`Add database` : t`Edit database configuration`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <DatabaseMappingForm
        mapping={mapping}
        databases={databases}
        canDelete={canDelete}
        isReadOnly={isReadOnly}
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
  canDelete: boolean;
  isReadOnly: boolean;
  onSubmit: (mapping: WorkspaceDatabaseDraft) => void;
  onDelete?: (mapping: WorkspaceDatabaseDraft) => void;
  onClose: () => void;
};

function DatabaseMappingForm({
  mapping,
  databases,
  canDelete,
  isReadOnly,
  onSubmit,
  onDelete,
  onClose,
}: DatabaseMappingFormProps) {
  const isNew = mapping == null;
  const hasDelete = !isNew && onDelete != null;

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
                readOnly={isReadOnly}
                onChange={handleDatabaseChange}
              />
              {databaseId != null && (
                <DatabaseSchemasSelect
                  databaseId={databaseId}
                  isReadOnly={isReadOnly}
                />
              )}
              <Group>
                {hasDelete && (
                  <Tooltip
                    label={getDeleteButtonLabel(isReadOnly, canDelete) ?? ""}
                    disabled={
                      getDeleteButtonLabel(isReadOnly, canDelete) == null
                    }
                  >
                    <Button
                      variant="subtle"
                      color="error"
                      disabled={isReadOnly || !canDelete}
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
                  disabled={!isReadOnly}
                >
                  <FormSubmitButton
                    label={isNew ? t`Add database` : t`Save`}
                    variant="filled"
                    disabled={isReadOnly}
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

function getDeleteButtonLabel(
  isReadOnly: boolean,
  canDelete: boolean,
): string | undefined {
  if (isReadOnly) {
    return t`Unprovision this workspace before editing.`;
  }
  if (!canDelete) {
    return t`A workspace must have at least one database.`;
  }
}

type DatabaseSchemasSelectProps = {
  databaseId: DatabaseId;
  isReadOnly: boolean;
};

function DatabaseSchemasSelect({
  databaseId,
  isReadOnly,
}: DatabaseSchemasSelectProps) {
  const { data: schemas = [] } = useListDatabaseSchemasQuery(
    databaseId != null ? { id: databaseId, include_hidden: true } : skipToken,
  );

  return (
    <FormMultiSelect
      name="input_schemas"
      label={t`Input schemas`}
      description={t`Tables in these schemas will be readable when this workspace is used.`}
      placeholder={t`Select schemas`}
      data={schemas}
      searchable
      readOnly={isReadOnly}
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
