import { CollectionRowMenu as BaseCollectionRowMenu } from "metabase/common/collections/components/CollectionRowMenu";
import type { Transform } from "metabase-types/api";

import type { CollectionNode, TransformsFolderModalState } from "./types";

type CollectionRowMenuProps = {
  folder: CollectionNode;
  /** The transforms in the folder and its subfolders. */
  transforms: Transform[];
  onOpenModal: (modal: TransformsFolderModalState) => void;
};

/**
 * The row menu of a transforms folder. A transforms folder is deleted, not archived. "Delete" shows only when the
 * user can edit the folder and every transform in it, which is what the backend requires.
 */
export function CollectionRowMenu({
  folder,
  transforms,
  onOpenModal,
}: CollectionRowMenuProps) {
  const canDelete = transforms.every((transform) => transform.can_write);

  return (
    <BaseCollectionRowMenu
      collection={folder.collection}
      onOpenModal={onOpenModal}
      onDelete={
        canDelete ? () => onOpenModal({ type: "delete", folder }) : undefined
      }
    />
  );
}
