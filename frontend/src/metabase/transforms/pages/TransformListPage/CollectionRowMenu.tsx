import { CollectionRowMenu as BaseCollectionRowMenu } from "metabase/common/collections/components/CollectionRowMenu";
import type { Collection } from "metabase-types/api";

import type { FolderTransform, TransformsFolderModalState } from "./types";

type CollectionRowMenuProps = {
  collection: Collection;
  transforms: FolderTransform[];
  onOpenModal: (modal: TransformsFolderModalState) => void;
};

/**
 * The row menu of a transforms folder. A transforms folder is deleted, not archived. "Delete" shows only when the
 * user can edit the folder and every transform in it, which is what the backend requires.
 */
export function CollectionRowMenu({
  collection,
  transforms,
  onOpenModal,
}: CollectionRowMenuProps) {
  const canDelete = transforms.every((transform) => transform.can_write);

  return (
    <BaseCollectionRowMenu
      collection={collection}
      onOpenModal={onOpenModal}
      onDelete={
        canDelete
          ? () => onOpenModal({ type: "delete", collection, transforms })
          : undefined
      }
    />
  );
}
