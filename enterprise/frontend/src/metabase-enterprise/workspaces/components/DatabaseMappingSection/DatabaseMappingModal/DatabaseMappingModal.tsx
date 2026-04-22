import { useFormikContext } from "formik";
import { t } from "ttag";
import * as Yup from "yup";

import {
  skipToken,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
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
import type { Database, WorkspaceDatabaseDraft } from "metabase-types/api";

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

function getInitialValues(
  mapping?: WorkspaceDatabaseDraft,
): DatabaseMappingFormValues {
  return {
    database_id:
      mapping?.database_id != null ? String(mapping.database_id) : "",
    input_schemas: mapping?.input_schemas ?? [],
  };
}

function getMapping(values: DatabaseMappingFormValues): WorkspaceDatabaseDraft {
  return {
    database_id: Number(values.database_id),
    input_schemas: values.input_schemas,
  };
}

type DatabaseMappingModalProps = {
  mapping?: WorkspaceDatabaseDraft;
  onSubmit: (mapping: WorkspaceDatabaseDraft) => void;
  onDelete?: (mapping: WorkspaceDatabaseDraft) => void;
  onClose: () => void;
};

export function DatabaseMappingModal({
  mapping,
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
        onSubmit={onSubmit}
        onDelete={onDelete}
        onClose={onClose}
      />
    </Modal>
  );
}

type DatabaseMappingFormProps = {
  mapping?: WorkspaceDatabaseDraft;
  onSubmit: (mapping: WorkspaceDatabaseDraft) => void;
  onDelete?: (mapping: WorkspaceDatabaseDraft) => void;
  onClose: () => void;
};

function DatabaseMappingForm({
  mapping,
  onSubmit,
  onDelete,
  onClose,
}: DatabaseMappingFormProps) {
  const isNew = mapping == null;

  const handleSubmit = (values: DatabaseMappingFormValues) => {
    onSubmit(getMapping(values));
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
      <DatabaseMappingFormFields
        isNew={isNew}
        onDelete={!isNew && onDelete ? handleDelete : undefined}
        onClose={onClose}
      />
    </FormProvider>
  );
}

type DatabaseMappingFormFieldsProps = {
  isNew: boolean;
  onDelete?: () => void;
  onClose: () => void;
};

function DatabaseMappingFormFields({
  isNew,
  onDelete,
  onClose,
}: DatabaseMappingFormFieldsProps) {
  const { values, setFieldValue } =
    useFormikContext<DatabaseMappingFormValues>();

  const { data: databasesResponse } = useListDatabasesQuery();
  const databases = databasesResponse?.data ?? [];

  const databaseId = values.database_id ? Number(values.database_id) : null;

  const { data: schemas = [] } = useListDatabaseSchemasQuery(
    databaseId != null ? { id: databaseId, include_hidden: true } : skipToken,
  );

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
          <FormMultiSelect
            name="input_schemas"
            label={t`Accessible schemas`}
            description={t`Tables in these schemas will be readable when this workspace is used.`}
            placeholder={t`Select schemas`}
            data={schemas}
            searchable
          />
        )}
        <Group>
          {onDelete && (
            <Button variant="subtle" color="error" onClick={onDelete}>
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
}

function getDatabaseOptions(databases: Database[]) {
  return databases.map((database) => ({
    value: String(database.id),
    label: database.name,
  }));
}
