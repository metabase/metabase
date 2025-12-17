import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { canonicalCollectionId } from "metabase/collections/utils";
import {
  type CollectionPickerItem,
  CollectionPickerModal,
} from "metabase/common/components/Pickers/CollectionPicker";
import type { Transform } from "metabase-types/api";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import { TRANSFORM_COLLECTION_PICKER_OPTIONS } from "metabase-enterprise/transforms/components/TransformCollectionPicker";

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
      title={t`Move "${transform.name}"`}
      value={pickerValue}
      onChange={handleChange}
      onClose={onClose}
      options={TRANSFORM_COLLECTION_PICKER_OPTIONS}
    />
  );
}
