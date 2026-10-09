import { msgid, ngettext, t } from "ttag";

import { CollectionRowMenu as BaseCollectionRowMenu } from "metabase/common/collections/components/CollectionRowMenu";
import type { CollectionRowModalState } from "metabase/common/collections/components/CollectionRowModal";
import type { Collection } from "metabase-types/api";

type CollectionRowMenuProps = {
  collection: Collection;
  transformCount: number;
  onOpenModal: (modal: CollectionRowModalState) => void;
};

export function CollectionRowMenu(props: CollectionRowMenuProps) {
  const { collection, transformCount, onOpenModal } = props;

  return (
    <BaseCollectionRowMenu
      collection={collection}
      onOpenModal={onOpenModal}
      customArchiveMessage={
        transformCount > 0
          ? ngettext(
              msgid`This will also archive ${transformCount} transform inside it.`,
              `This will also archive ${transformCount} transforms inside it.`,
              transformCount,
            )
          : t`Are you sure you want to archive this folder?`
      }
    />
  );
}
