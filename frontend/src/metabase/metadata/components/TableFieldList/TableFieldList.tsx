import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useUpdateFieldMutation } from "metabase/api";
import { FieldList } from "metabase/metadata/components/FieldList";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { Field, FieldId, Table } from "metabase-types/api";

interface Props {
  table: Table;
  getFieldHref: (fieldId: FieldId) => string;
  activeFieldId?: FieldId;
}

export const TableFieldList = ({
  table,
  activeFieldId,
  getFieldHref,
}: Props) => {
  const [updateField] = useUpdateFieldMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const fields = useMemo(() => {
    return _.sortBy(table.fields ?? [], (item) => item.position);
  }, [table.fields]);

  const handleNameChange = async (field: Field, name: string) => {
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
  };

  const handleDescriptionChange = async (
    field: Field,
    description: string | null,
  ) => {
    const id = getRawTableFieldId(field);
    const { error } = await updateField({ id, description });

    if (error) {
      sendErrorToast(t`Failed to update description of ${field.display_name}`);
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
  };

  return (
    <FieldList
      fields={fields}
      activeFieldKey={activeFieldId}
      getFieldKey={getRawTableFieldId}
      getFieldHref={(field) => getFieldHref(getRawTableFieldId(field))}
      onNameChange={handleNameChange}
      onDescriptionChange={handleDescriptionChange}
    />
  );
};
