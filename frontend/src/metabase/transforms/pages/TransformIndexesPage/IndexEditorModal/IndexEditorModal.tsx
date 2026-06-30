import { useState } from "react";
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
import { Modal } from "metabase/ui";
import type {
  IndexField,
  RequestableIndexes,
  Table,
  TableIndexEntry,
  Transform,
} from "metabase-types/api";

import { IndexEditorForm } from "./IndexEditorForm";
import type { ColumnOption } from "./types";
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
  const isEditing = request != null;
  const tableId = transform.table?.id;
  const requestableIndexes = transform.requestable_indexes;
  const kinds = transform.requestable_indexes
    ? Object.keys(transform.requestable_indexes)
    : [];
  const [kind, setKind] = useState<string>(
    request?.structured.kind ? request?.structured.kind : kinds[0],
  );

  const {
    data: table,
    isLoading,
    error,
  } = useGetTableQueryMetadataQuery(
    tableId != null ? { id: tableId } : skipToken,
  );

  const columnOptions = getColumnOptions(table);
  const fields = getFields(kind, requestableIndexes);
  const initialValues = buildInitialValues(fields, request?.structured);
  const validationSchema = buildValidationSchema(fields);
  const [createTableIndex] = useCreateTableIndexMutation();
  const [updateTableIndex] = useUpdateTableIndexMutation();
  const [sendToast] = useToast();

  async function handleSubmit(values: IndexFormValues) {
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
    }
  }

  return (
    <Modal
      opened
      title={isEditing ? t`Edit index` : t`Create an index`}
      padding="xl"
      onClose={onClose}
    >
      {isLoading || error != null ? (
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      ) : (
        <FormProvider
          key={kind}
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          <IndexEditorForm
            kind={kind}
            kinds={kinds}
            fields={fields}
            columnOptions={columnOptions}
            isEditing={isEditing}
            submitLabel={isEditing ? t`Update index` : t`Create index`}
            onKindChange={setKind}
            onClose={onClose}
          />
        </FormProvider>
      )}
    </Modal>
  );
}

function getFields(
  kind: string,
  requestableIndexes: RequestableIndexes | null | undefined,
): IndexField[] | never[] {
  if (!requestableIndexes) {
    return [];
  }
  const fields =
    kind in requestableIndexes ? requestableIndexes[kind].fields : [];
  return fields;
}

function getColumnOptions(table: Table | undefined): ColumnOption[] {
  if (!table?.fields) {
    return [];
  }
  return table.fields.map((field) => ({
    value: field.name,
    label: field.display_name ?? field.name,
  }));
}
