import { useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  skipToken,
  useCreateTableIndexMutation,
  useGetTableQueryMetadataQuery,
  useUpdateTableIndexMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import { FormProvider } from "metabase/forms";
import { type ComboboxItem, Modal, Text } from "metabase/ui";
import { getObjectKeys } from "metabase/utils/objects";
import type {
  IndexKind,
  Table,
  TableIndexEntry,
  Transform,
} from "metabase-types/api";

import { IndexEditorForm } from "./IndexEditorForm";
import type { IndexKindOption } from "./types";
import {
  type IndexFormValues,
  buildInitialValues,
  buildValidationSchema,
  toStructured,
} from "./utils";

type IndexEditorModalProps = {
  transform: Transform;
  index?: TableIndexEntry;
  onClose: () => void;
};

export function IndexEditorModal({
  transform,
  index,
  onClose,
}: IndexEditorModalProps) {
  const request = index?.request;
  const isEditing = request !== undefined;
  const tableId = transform.table?.id;
  const requestableIndexes = transform.requestable_indexes;
  const kinds = requestableIndexes ? getObjectKeys(requestableIndexes) : [];
  const indexKindOptions: IndexKindOption[] = kinds.map((kind) => {
    const method = requestableIndexes?.[kind];
    return {
      value: kind,
      label: method?.["display-name"] ?? kind,
      description: method?.description ?? null,
    };
  });
  const [kind, setKind] = useState<IndexKind | undefined>(
    request?.structured.kind ?? kinds[0],
  );
  const [carriedValues, setCarriedValues] = useState<IndexFormValues>({});

  function handleKindChange(nextKind: IndexKind, values: IndexFormValues) {
    setCarriedValues(values);
    setKind(nextKind);
  }

  const {
    data: table,
    isLoading,
    error,
  } = useGetTableQueryMetadataQuery(
    tableId !== undefined ? { id: tableId } : skipToken,
  );

  const method = kind !== undefined ? requestableIndexes?.[kind] : undefined;
  const columnOptions = getColumnOptions(table);
  const fields = method?.fields ?? [];
  const initialValues = buildInitialValues(
    fields,
    request?.structured,
    carriedValues,
  );
  const validationSchema = buildValidationSchema(fields);
  const [createTableIndex] = useCreateTableIndexMutation();
  const [updateTableIndex] = useUpdateTableIndexMutation();
  const [sendToast] = useToast();

  async function handleSubmit(values: IndexFormValues) {
    if (kind === undefined) {
      return;
    }
    const structured = toStructured(kind, fields, values);
    try {
      if (isEditing) {
        await updateTableIndex({ id: request.id, structured }).unwrap();
        sendToast({ message: t`Index updated` });
      } else {
        await createTableIndex({
          transform_id: transform.id,
          structured,
        }).unwrap();
        sendToast({ message: t`Index created` });
      }
      onClose();
    } catch (submitError) {
      sendToast({
        message: getErrorMessage(submitError, t`Failed to save index`),
        icon: "warning",
      });
      throw submitError;
    }
  }

  return (
    <Modal
      opened
      title={isEditing ? t`Edit index` : t`Create an index`}
      padding="xl"
      onClose={onClose}
    >
      {isLoading || error !== undefined ? (
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      ) : kind === undefined ||
        method === undefined ||
        tableId === undefined ? (
        <Text c="text-secondary">
          {match(tableId)
            .with(
              undefined,
              () => t`Run the transform before editing its indexes.`,
            )
            .otherwise(() => t`This index type is no longer available.`)}
        </Text>
      ) : (
        <FormProvider
          key={kind}
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          <IndexEditorForm
            kind={kind}
            kindOptions={indexKindOptions}
            fields={fields}
            columnOptions={columnOptions}
            isEditing={isEditing}
            submitLabel={isEditing ? t`Update index` : t`Create index`}
            onKindChange={handleKindChange}
            onClose={onClose}
          />
        </FormProvider>
      )}
    </Modal>
  );
}

function getColumnOptions(table: Table | undefined): ComboboxItem[] {
  if (!table?.fields) {
    return [];
  }
  return table.fields.map((field) => ({
    value: field.name,
    label: field.display_name ?? field.name,
  }));
}
