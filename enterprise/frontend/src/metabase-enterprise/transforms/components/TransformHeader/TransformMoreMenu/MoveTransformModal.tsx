import { useCallback, useMemo } from "react";
import { c } from "ttag";

import { canonicalCollectionId } from "metabase/collections/utils";
import type {
  EntityPickerOptions,
  OmniPickerItem,
  OmniPickerValue,
} from "metabase/common/components/Pickers";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

const TRANSFORM_COLLECTION_PICKER_OPTIONS: EntityPickerOptions = {
  hasSearch: false,
  hasRecents: false,
  hasLibrary: false,
  hasRootCollection: true,
  hasPersonalCollections: false,

  hasConfirmButtons: true,
  canCreateCollections: true,
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
    async ({ id }: OmniPickerItem) => {
      const collectionId = canonicalCollectionId(id);
      await updateTransform({
        id: transform.id,
        collection_id: collectionId,
      }).unwrap();
      onMove();
    },
    [transform.id, updateTransform, onMove],
  );

  const pickerValue: OmniPickerValue = useMemo(
    () => ({
      id: transform.collection_id ?? "root",
      model: "collection",
      namespace: "transforms",
    }),
    [transform.collection_id],
  );

  return (
    <CollectionPickerModal
      title={c("dialog title for moving a transform to another collection")
        .t`Move "${transform.name}"`}
      value={pickerValue}
      namespaces={["transforms"]}
      onChange={handleChange}
      onClose={onClose}
      options={TRANSFORM_COLLECTION_PICKER_OPTIONS}
    />
  );
}
