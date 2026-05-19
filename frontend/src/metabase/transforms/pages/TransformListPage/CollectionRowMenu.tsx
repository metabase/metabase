import { msgid, ngettext, t } from "ttag";

import { CollectionRowMenu as BaseCollectionRowMenu } from "metabase/collections/components/CollectionRowMenu";
import type { Collection } from "metabase-types/api";

type CollectionRowMenuProps = {
  collection: Collection;
  transformCount: number;
};

export function CollectionRowMenu(props: CollectionRowMenuProps) {
  const { collection, transformCount } = props;

  return (
    <BaseCollectionRowMenu
      collection={collection}
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
