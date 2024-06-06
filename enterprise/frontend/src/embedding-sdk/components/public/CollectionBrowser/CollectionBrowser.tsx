import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import { CollectionItemsTable } from "metabase/collections/components/CollectionContent/CollectionItemsTable";
import type { CollectionId, CollectionItem } from "metabase-types/api";

export const CollectionBrowser = withPublicComponentWrapper(
  ({
    collectionId,
    onClick,
  }: {
    collectionId: CollectionId;
    onClick: (item: CollectionItem, event: any) => void;
  }) => {
    return (
      <CollectionItemsTable collectionId={collectionId} onClick={onClick} />
    );
  },
);
