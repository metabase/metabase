import { useCallback, useMemo } from "react";
import { c } from "ttag";

import {
  useGetCollectionQuery,
  useUpdateTransformMutation,
} from "metabase/api";
import { canonicalCollectionId } from "metabase/common/collections/utils";
import type {
  EntityPickerOptions,
  OmniPickerItem,
  OmniPickerValue,
} from "metabase/common/components/Pickers";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
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
  const { data: rootCollection, isLoading } = useGetCollectionQuery({
    id: "root",
    namespace: "transforms",
  });

  const handleChange = useCallback(
    async ({ id }: OmniPickerItem) => {
      await updateTransform({
        id: transform.id,
        collection_id: canonicalCollectionId(id) ?? rootCollection?.id,
      }).unwrap();
      onMove();
    },
    [transform.id, updateTransform, onMove, rootCollection?.id],
  );

  const pickerValue: OmniPickerValue = useMemo(
    () => ({
      id:
        transform.collection_id === rootCollection?.id
          ? "root"
          : transform.collection_id,
      model: "collection",
      namespace: "transforms",
    }),
    [transform.collection_id, rootCollection?.id],
  );

  if (isLoading) {
    return null;
  }

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
