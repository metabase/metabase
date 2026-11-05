import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useUpdateFieldMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import { FieldList } from "metabase/metadata/components/FieldList";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { Field, FieldId, Table } from "metabase-types/api";

interface Props {
  table: Table;
  getFieldHref: (fieldId: FieldId) => string;
  activeFieldId?: FieldId;
  /** Only fields it returns true for are listed, e.g. ones matching a search */
  filterField?: (field: Field) => boolean;
}

export const TableFieldList = ({
  table,
  activeFieldId,
  filterField,
  getFieldHref,
}: Props) => {
  const [updateField] = useUpdateFieldMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const fields = useMemo(() => {
    const sortedFields = _.sortBy(table.fields ?? [], (item) => item.position);
    return filterField ? sortedFields.filter(filterField) : sortedFields;
  }, [table.fields, filterField]);

  const handleGetFieldHref = useCallback(
    (field: Field) => getFieldHref(getRawTableFieldId(field)),
    [getFieldHref],
  );

  const handleNameChange = useCallback(
    async (field: Field, name: string) => {
      const id = getRawTableFieldId(field);
      const { error } = await updateField({ id, display_name: name });

      if (error) {
        sendErrorToast(t`Failed to update name of ${field.display_name}`);
      } else {
        sendSuccessToast(t`Name of ${field.display_name} updated`, async () => {
          const { error } = await updateField({
            id,
            display_name: field.display_name,
          });
          sendUndoToast(error);
        });
      }
    },
    [sendErrorToast, sendSuccessToast, sendUndoToast, updateField],
  );

  const handleDescriptionChange = useCallback(
    async (field: Field, description: string | null) => {
      const id = getRawTableFieldId(field);
      const { error } = await updateField({ id, description });

      if (error) {
        sendErrorToast(
          t`Failed to update description of ${field.display_name}`,
        );
      } else {
        sendSuccessToast(
          t`Description of ${field.display_name} updated`,
          async () => {
            const { error } = await updateField({
              id,
              description: field.description ?? "",
            });
            sendUndoToast(error);
          },
        );
      }
    },
    [sendErrorToast, sendSuccessToast, sendUndoToast, updateField],
  );

  return (
    <FieldList
      fields={fields}
      activeFieldKey={activeFieldId}
      getFieldKey={getRawTableFieldId}
      getFieldHref={handleGetFieldHref}
      readOnly={!table.can_write}
      onNameChange={handleNameChange}
      onDescriptionChange={handleDescriptionChange}
    />
  );
};
