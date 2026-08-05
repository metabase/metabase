import { useCallback, useMemo } from "react";
import { c } from "ttag";

import { useUpdateTransformMutation } from "metabase/api";
import { canonicalCollectionId } from "metabase/common/collections/utils";
import type {
  EntityPickerOptions,
  OmniPickerItem,
  OmniPickerValue,
} from "metabase/common/components/Pickers";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import { useWorktreeId } from "metabase/common/worktrees";
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
  const worktreeId = useWorktreeId();

  const handleChange = useCallback(
    async ({ id }: OmniPickerItem) => {
      await updateTransform({
        id: transform.id,
        collection_id: canonicalCollectionId(id),
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

  const title = c("dialog title for moving a transform to another collection")
    .t`Move "${transform.name}"`;

  return (
    <CollectionPickerModal
      title={title}
      value={pickerValue}
      namespaces={["transforms"]}
      worktreeId={worktreeId}
      onChange={handleChange}
      onClose={onClose}
      options={TRANSFORM_COLLECTION_PICKER_OPTIONS}
    />
  );
}
