import { type ChangeEvent, useEffect, useState } from "react";
import { t } from "ttag";

import { useUpdateFieldMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import type { MetadataEditEventDetail } from "metabase/metadata/pages/shared/analytics";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { Field } from "metabase-types/api";

type UseFieldCastingOpts = {
  field: Field;
  onTrackMetadataChange: (detail: MetadataEditEventDetail) => void;
};

/**
 * State and handlers for a field's "Cast to a specific data type" switch and
 * coercion strategy picker. Turning the switch on opens the picker; turning it
 * off clears the field's coercion strategy.
 */
export function useFieldCasting({
  field,
  onTrackMetadataChange,
}: UseFieldCastingOpts) {
  const id = getRawTableFieldId(field);
  const [isCasting, setIsCasting] = useState(field.coercion_strategy != null);
  const [autoFocusCoercionPicker, setAutoFocusCoercionPicker] = useState(false);
  const [isCoercionPickerOpen, setIsCoercionPickerOpen] = useState(false);
  const [updateField] = useUpdateFieldMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  useEffect(() => {
    setIsCasting(field.coercion_strategy != null);
    setAutoFocusCoercionPicker(false);
  }, [field.coercion_strategy]);

  const disableCasting = async () => {
    const { error } = await updateField({
      id,
      coercion_strategy: null,
    });

    if (error) {
      sendErrorToast(t`Failed to disable casting for ${field.display_name}`);
    } else {
      sendSuccessToast(
        t`Casting disabled for ${field.display_name}`,
        async () => {
          const { error } = await updateField({
            id,
            coercion_strategy: field.coercion_strategy,
          });
          sendUndoToast(error);
        },
      );
    }
  };

  const handleCastingChange = async (event: ChangeEvent<HTMLInputElement>) => {
    setIsCasting(event.target.checked);
    setAutoFocusCoercionPicker(event.target.checked);

    if (event.target.checked) {
      setIsCoercionPickerOpen(true);
    } else if (field.coercion_strategy != null) {
      await disableCasting();
    }
  };

  const handleCoercionStrategyChange = async (
    coercionStrategy: string | null,
  ) => {
    const { error } = await updateField({
      id,
      coercion_strategy: coercionStrategy,
    });

    if (error) {
      sendErrorToast(
        field.coercion_strategy == null
          ? t`Failed to enable casting for ${field.display_name}`
          : t`Failed to update casting for ${field.display_name}`,
      );
    } else {
      onTrackMetadataChange("type_casting");

      sendSuccessToast(
        field.coercion_strategy == null
          ? t`Casting enabled for ${field.display_name}`
          : t`Casting updated for ${field.display_name}`,
        async () => {
          const { error } = await updateField({
            id,
            coercion_strategy: field.coercion_strategy,
          });
          sendUndoToast(error);
        },
      );
    }
  };

  return {
    isCasting,
    autoFocusCoercionPicker,
    isCoercionPickerOpen,
    setIsCoercionPickerOpen,
    handleCastingChange,
    handleCoercionStrategyChange,
  };
}
