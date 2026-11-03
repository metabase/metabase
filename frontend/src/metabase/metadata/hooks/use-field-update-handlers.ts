import { t } from "ttag";

import { useUpdateFieldMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { Field } from "metabase-types/api";

/** Saves a field's display name or description, with success/undo/error toasts. */
export function useFieldUpdateHandlers({ field }: { field: Field }) {
  const id = getRawTableFieldId(field);
  const [updateField] = useUpdateFieldMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const handleNameChange = async (name: string) => {
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

  const handleDescriptionChange = async (description: string) => {
    const { error } = await updateField({
      id,
      // API does not accept empty strings
      description: description.length === 0 ? null : description,
    });

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

  return { handleNameChange, handleDescriptionChange };
}
