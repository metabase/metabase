import { useMemo, useState } from "react";
import { t } from "ttag";

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
  Select,
  Stack,
  Text,
} from "metabase/ui";
import type {
  RequestableIndexes,
  TableId,
  TransformId,
} from "metabase-types/api";

import { IndexFormFields } from "./IndexFormFields";
import {
  type IndexFormValues,
  buildIndexValidationSchema,
  buildStructuredIndex,
  getIndexFormInitialValues,
} from "./index-form";

type CreateIndexModalProps = {
  transformId: TransformId;
  tableId: TableId | null;
  requestableIndexes?: RequestableIndexes | null;
  onClose: () => void;
};

export function CreateIndexModal(props: CreateIndexModalProps) {
  return (
    <Modal title={t`Create index`} opened padding="xl" onClose={props.onClose}>
      <FocusTrap.InitialFocus />
      <CreateIndexForm {...props} />
    </Modal>
  );
}

function CreateIndexForm({
  transformId,
  tableId,
  requestableIndexes,
  onClose,
}: CreateIndexModalProps) {
  const [sendToast] = useToast();
  const [createIndex] = useCreateTableIndexMutation();
  const { data: table, isLoading } = useGetTableQueryMetadataQuery(
    tableId != null ? { id: tableId } : skipToken,
  );

  const kinds = Object.keys(requestableIndexes ?? {});
  const [kind, setKind] = useState(kinds[0] ?? "");
  const method = requestableIndexes?.[kind];

  const columnOptions = useMemo<ComboboxItem[]>(
    () =>
      (table?.fields ?? []).map((field) => ({
        value: field.name,
        label: field.display_name || field.name,
      })),
    [table],
  );

  if (tableId == null) {
    return (
      <Text c="text-secondary">
        {t`Run this transform first to create its target table, then you can add indexes.`}
      </Text>
    );
  }

  if (kinds.length === 0 || method == null) {
    return (
      <Text c="text-secondary">
        {t`This database doesn't support creating indexes on transform tables.`}
      </Text>
    );
  }

  const handleSubmit = async (values: IndexFormValues) => {
    try {
      await createIndex({
        transform_id: transformId,
        structured: buildStructuredIndex(kind, method.fields, values),
      }).unwrap();
      onClose();
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Failed to schedule creating index`),
        icon: "warning",
      });
    }
  };

  return (
    <Stack gap="lg">
      {kinds.length > 1 && (
        <Select
          label={t`Index type`}
          data={kinds.map((value) => ({ value, label: value }))}
          value={kind}
          onChange={(value) => {
            if (value) {
              setKind(value);
            }
          }}
        />
      )}
      <FormProvider
        key={kind}
        initialValues={getIndexFormInitialValues(method.fields)}
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
              <FormSubmitButton label={t`Create`} variant="filled" />
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Stack>
  );
}
