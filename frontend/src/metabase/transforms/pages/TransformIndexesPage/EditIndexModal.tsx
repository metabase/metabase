import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

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
  FormMultiSelect,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Box, Button, FocusTrap, Group, Modal, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import {
  CLASSICAL_INDEX_KINDS,
  type ClassicalIndexKind,
  type Index,
  type StructuredIndex,
  type TableId,
} from "metabase-types/api";

type EditIndexModalProps = {
  index: Index;
  tableId: TableId | null;
  onClose: () => void;
};

type EditIndexValues = {
  name: string;
  columns: string[];
};

const EDIT_INDEX_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  columns: Yup.array(Yup.string().required()).min(1, Errors.required),
});

function isClassicalIndexKind(kind: string): kind is ClassicalIndexKind {
  return CLASSICAL_INDEX_KINDS.some((classicalKind) => classicalKind === kind);
}

// Managed indexes are created as classical (btree) indexes, so preserve the
// existing classical kind on update and fall back to btree otherwise.
function getEditableKind(structured: StructuredIndex): ClassicalIndexKind {
  return isClassicalIndexKind(structured.kind) ? structured.kind : "btree";
}

export function EditIndexModal({
  index,
  tableId,
  onClose,
}: EditIndexModalProps) {
  return (
    <Modal title={t`Edit index`} opened padding="xl" onClose={onClose}>
      <FocusTrap.InitialFocus />
      <EditIndexForm index={index} tableId={tableId} onClose={onClose} />
    </Modal>
  );
}

function EditIndexForm({ index, tableId, onClose }: EditIndexModalProps) {
  const [sendToast] = useToast();
  const [updateIndex] = useUpdateTableIndexMutation();
  const { data: table, isLoading } = useGetTableQueryMetadataQuery(
    tableId != null ? { id: tableId } : skipToken,
  );

  const request = index.request;

  const columnOptions = useMemo(
    () =>
      (table?.fields ?? []).map((field) => ({
        value: field.name,
        label: field.display_name || field.name,
      })),
    [table],
  );

  const initialValues = useMemo<EditIndexValues>(
    () => ({
      name: request?.index_name ?? index.name ?? "",
      columns: index.key_columns,
    }),
    [request, index.name, index.key_columns],
  );

  if (request == null) {
    return null;
  }

  const handleSubmit = async ({ name, columns }: EditIndexValues) => {
    try {
      await updateIndex({
        id: request.id,
        structured: {
          kind: getEditableKind(request.structured),
          name,
          columns: columns.map((column) => ({ name: column })),
        },
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
      validationSchema={EDIT_INDEX_SCHEMA}
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
            <FormSubmitButton label={t`Save`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
