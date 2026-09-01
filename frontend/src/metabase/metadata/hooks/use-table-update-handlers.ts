import { t } from "ttag";

import {
  useUpdateTableFieldsOrderMutation,
  useUpdateTableMutation,
} from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { FieldId, Table, TableFieldOrder } from "metabase-types/api";

type UseTableUpdateHandlersOpts = {
  table: Table;
  onNameUpdated?: () => void;
};

export function useTableUpdateHandlers({
  table,
  onNameUpdated,
}: UseTableUpdateHandlersOpts) {
  const [updateTable] = useUpdateTableMutation();
  const [updateTableSorting, { isLoading: isUpdatingSorting }] =
    useUpdateTableMutation();
  const [updateTableFieldsOrder] = useUpdateTableFieldsOrderMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const handleNameChange = async (name: string) => {
    const { error } = await updateTable({
      id: table.id,
      display_name: name,
    });

    if (error) {
      sendErrorToast(t`Failed to update table name`);
    } else {
      onNameUpdated?.();
      sendSuccessToast(t`Table name updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          display_name: table.display_name,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleDescriptionChange = async (description: string) => {
    const { error } = await updateTable({ id: table.id, description });

    if (error) {
      sendErrorToast(t`Failed to update table description`);
    } else {
      sendSuccessToast(t`Table description updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          description: table.description ?? "",
        });
        sendUndoToast(error);
      });
    }
  };

  const handleFieldOrderTypeChange = async (fieldOrder: TableFieldOrder) => {
    const { error } = await updateTableSorting({
      id: table.id,
      field_order: fieldOrder,
    });

    if (error) {
      sendErrorToast(t`Failed to update field order`);
    } else {
      sendSuccessToast(t`Field order updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          field_order: table.field_order,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleCustomFieldOrderChange = async (fieldOrder: FieldId[]) => {
    const { error } = await updateTableFieldsOrder({
      id: table.id,
      field_order: fieldOrder,
    });

    if (error) {
      sendErrorToast(t`Failed to update field order`);
    } else {
      sendSuccessToast(t`Field order updated`, async () => {
        // A single request per undo: restoring a non-custom order through
        // PUT /api/table recomputes every field position server-side, and
        // restoring a custom order only needs the positions themselves.
        if (table.field_order === "custom") {
          const { error: undoError } = await updateTableFieldsOrder({
            id: table.id,
            field_order: table.fields?.map(getRawTableFieldId) ?? [],
          });
          sendUndoToast(undoError);
        } else {
          const { error: undoError } = await updateTable({
            id: table.id,
            field_order: table.field_order,
          });
          sendUndoToast(undoError);
        }
      });
    }
  };

  return {
    handleNameChange,
    handleDescriptionChange,
    handleFieldOrderTypeChange,
    handleCustomFieldOrderChange,
    isUpdatingSorting,
  };
}
