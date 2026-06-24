import { useMemo } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetTableQueryMetadataQuery,
  useUpdateTableIndexMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import {
  Box,
  Button,
  type ComboboxItem,
  FocusTrap,
  Group,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import type {
  RequestableIndexes,
  TableId,
  TableIndexEntry,
} from "metabase-types/api";

import { IndexFormFields } from "./IndexFormFields";
import {
  type IndexFormValues,
  buildIndexValidationSchema,
  buildStructuredIndex,
  getIndexFormInitialValues,
} from "./index-form";

type EditIndexModalProps = {
  index: TableIndexEntry;
  tableId: TableId | null;
  requestableIndexes?: RequestableIndexes | null;
  onClose: () => void;
};

export function EditIndexModal(props: EditIndexModalProps) {
  return (
    <Modal title={t`Edit index`} opened padding="xl" onClose={props.onClose}>
      <FocusTrap.InitialFocus />
      <EditIndexForm {...props} />
    </Modal>
  );
}

function EditIndexForm({
  index,
  tableId,
  requestableIndexes,
  onClose,
}: EditIndexModalProps) {
  const [sendToast] = useToast();
  const [updateIndex] = useUpdateTableIndexMutation();
  const { data: table, isLoading } = useGetTableQueryMetadataQuery(
    tableId != null ? { id: tableId } : skipToken,
  );

  const columnOptions = useMemo<ComboboxItem[]>(
    () =>
      (table?.fields ?? []).map((field) => ({
        value: field.name,
        label: field.display_name || field.name,
      })),
    [table],
  );

  const request = index.request;
  if (request == null) {
    return null;
  }

  // The kind is fixed for an existing managed index; render the fields the
  // driver advertises for that kind, seeded from the saved request.
  const kind = request.structured.kind;
  const method = requestableIndexes?.[kind];
  if (method == null) {
    return (
      <Text c="text-secondary">{t`This index type can't be edited.`}</Text>
    );
  }

  const initialValues = getIndexFormInitialValues(
    method.fields,
    request.structured,
  );

  const handleSubmit = async (values: IndexFormValues) => {
    try {
      await updateIndex({
        id: request.id,
        structured: buildStructuredIndex(kind, method.fields, values),
      }).unwrap();
      onClose();
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Failed to update index`),
        icon: "warning",
      });
    }
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={buildIndexValidationSchema(method.fields)}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <IndexFormFields
            fields={method.fields}
            columnOptions={columnOptions}
            isLoadingColumns={isLoading}
          />
          <Group>
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Save`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
