import { useCallback, useMemo } from "react";
import { c, t } from "ttag";

import { useUpdateActionMutation } from "metabase/api";
import { canonicalCollectionId } from "metabase/common/collections/utils";
import type {
  OmniPickerItem,
  OmniPickerValue,
} from "metabase/common/components/Pickers";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import { useMetadataToasts } from "metabase/common/hooks";
import type { WritebackAction } from "metabase-types/api";

import {
  ACTION_COLLECTION_NAMESPACES,
  ACTION_COLLECTION_PICKER_OPTIONS,
} from "../../../../constants";

type MoveActionModalProps = {
  action: WritebackAction;
  onClose: () => void;
};

export function MoveActionModal({ action, onClose }: MoveActionModalProps) {
  const [updateAction] = useUpdateActionMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleChange = useCallback(
    async ({ id }: OmniPickerItem) => {
      const { error } = await updateAction({
        id: action.id,
        collection_id: canonicalCollectionId(id),
      });
      if (error) {
        sendErrorToast(t`Failed to move action`);
      } else {
        sendSuccessToast(t`Action moved`);
        onClose();
      }
    },
    [action.id, updateAction, sendSuccessToast, sendErrorToast, onClose],
  );

  const pickerValue = useMemo(
    (): OmniPickerValue => ({
      id: action.collection_id ?? "root",
      model: "collection",
    }),
    [action.collection_id],
  );

  return (
    <CollectionPickerModal
      title={c("dialog title for moving an action to another collection")
        .t`Move "${action.name}"`}
      value={pickerValue}
      onChange={handleChange}
      onClose={onClose}
      namespaces={ACTION_COLLECTION_NAMESPACES}
      options={ACTION_COLLECTION_PICKER_OPTIONS}
    />
  );
}
