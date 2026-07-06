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
import { getObjectKeys } from "metabase/utils/objects";
import type {
  IndexField,
  IndexKind,
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
  const kinds = requestableIndexes ? getObjectKeys(requestableIndexes) : [];
  const [kind, setKind] = useState<IndexKind>(
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
  // Adding or changing an index on an incremental transform reprocesses the table from scratch on the next run.
  const willRebuild = transform.target?.type === "table-incremental";
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
            showRebuildWarning={willRebuild}
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
  kind: IndexKind,
  requestableIndexes: RequestableIndexes | null | undefined,
): IndexField[] {
  return requestableIndexes?.[kind]?.fields ?? [];
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
