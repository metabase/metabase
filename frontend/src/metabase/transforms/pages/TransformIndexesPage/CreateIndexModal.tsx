import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  skipToken,
  useCreateTableIndexMutation,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormMultiSelect,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Box, Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import type { TableId, TransformId } from "metabase-types/api";

type CreateIndexModalProps = {
  transformId: TransformId;
  tableId: TableId | null;
  onClose: () => void;
};

type CreateIndexValues = {
  name: string;
  columns: string[];
};

const CREATE_INDEX_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  columns: Yup.array(Yup.string().required()).min(1, Errors.required),
});

const INITIAL_VALUES: CreateIndexValues = { name: "", columns: [] };

export function CreateIndexModal({
  transformId,
  tableId,
  onClose,
}: CreateIndexModalProps) {
  return (
    <Modal title={t`Create index`} opened padding="xl" onClose={onClose}>
      <FocusTrap.InitialFocus />
      <CreateIndexForm
        transformId={transformId}
        tableId={tableId}
        onClose={onClose}
      />
    </Modal>
  );
}

function CreateIndexForm({
  transformId,
  tableId,
  onClose,
}: CreateIndexModalProps) {
  const [sendToast] = useToast();
  const [createIndex] = useCreateTableIndexMutation();
  const { data: table, isLoading } = useGetTableQueryMetadataQuery(
    tableId != null ? { id: tableId } : skipToken,
  );

  const columnOptions = useMemo(
    () =>
      (table?.fields ?? []).map((field) => ({
        value: field.name,
        label: field.display_name || field.name,
      })),
    [table],
  );

  const handleSubmit = async ({ name, columns }: CreateIndexValues) => {
    try {
      await createIndex({
        transform_id: transformId,
        structured: {
          kind: "btree",
          name,
          columns: columns.map((column) => ({ name: column })),
        },
      }).unwrap();
      onClose();
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Failed to schedule creating index`),
        icon: "warning",
      });
    }
  };

  if (tableId == null) {
    return (
      <Text c="text-secondary">
        {t`Run this transform first to create its target table, then you can add indexes.`}
      </Text>
    );
  }

  return (
    <FormProvider
      initialValues={INITIAL_VALUES}
      validationSchema={CREATE_INDEX_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <FormTextInput
            name="name"
            label={t`Index name`}
            placeholder={t`my_index`}
          />
          <FormMultiSelect
            name="columns"
            label={t`Columns`}
            placeholder={t`Select columns`}
            data={columnOptions}
            disabled={isLoading}
            searchable
          />
          <Group>
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Create`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
