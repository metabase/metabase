import { useCallback, useMemo } from "react";
import { c } from "ttag";

import { useUpdateTransformMutation } from "metabase/api";
import { canonicalCollectionId } from "metabase/collections/utils";
import {
  type CollectionPickerItem,
  CollectionPickerModal,
  type CollectionPickerOptions,
} from "metabase/common/components/Pickers/CollectionPicker";
import type { Transform } from "metabase-types/api";

const TRANSFORM_COLLECTION_PICKER_OPTIONS: CollectionPickerOptions = {
  namespace: "transforms",
  showPersonalCollections: false,
  showRootCollection: true,
  showSearch: false,
  hasConfirmButtons: true,
  allowCreateNew: true,
  hasRecents: false,
  showLibrary: false,
};

type MoveTransformModalProps = {
  transform: Transform;
  onMove: () => void;
  onClose: () => void;
};

export function MoveTransformModal({
  transform,
  onMove,
  onClose,
}: MoveTransformModalProps) {
  const [updateTransform] = useUpdateTransformMutation();

  const handleChange = useCallback(
    async ({ id }: CollectionPickerItem) => {
      const collectionId = canonicalCollectionId(id);
      await updateTransform({
        id: transform.id,
        collection_id: collectionId,
      }).unwrap();
      onMove();
    },
    [transform.id, updateTransform, onMove],
  );

  const pickerValue = useMemo(
    () => ({
      id: transform.collection_id ?? "root",
      model: "collection" as const,
    }),
    [transform.collection_id],
  );

  return (
    <CollectionPickerModal
      title={c("dialog title for moving a transform to another collection")
        .t`Move "${transform.name}"`}
      value={pickerValue}
      onChange={handleChange}
      onClose={onClose}
      options={TRANSFORM_COLLECTION_PICKER_OPTIONS}
    />
  );
}
