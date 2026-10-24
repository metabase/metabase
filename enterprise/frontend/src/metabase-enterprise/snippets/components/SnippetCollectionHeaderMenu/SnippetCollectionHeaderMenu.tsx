import { useState } from "react";

import { CollectionRowMenu } from "metabase/common/collections/components/CollectionRowMenu";
import {
  CollectionRowModal,
  type CollectionRowModalState,
} from "metabase/common/collections/components/CollectionRowModal";
import { CollectionPermissionsModal } from "metabase/permissions";
import type { Collection } from "metabase-types/api";

type SnippetCollectionHeaderMenuProps = {
  collection: Collection;
};

export function SnippetCollectionHeaderMenu({
  collection,
}: SnippetCollectionHeaderMenuProps) {
  const [collectionModal, setCollectionModal] =
    useState<CollectionRowModalState>();

  return (
    <>
      <CollectionRowMenu
        collection={collection}
        onOpenModal={setCollectionModal}
      />
      <CollectionRowModal
        PermissionsModal={CollectionPermissionsModal}
        modal={collectionModal}
        onClose={() => setCollectionModal(undefined)}
      />
    </>
  );
}
