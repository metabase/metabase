import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import { CollectionItemsTable } from "metabase/collections/components/CollectionContent/CollectionItemsTable";
import type { CollectionId } from "metabase-types/api";

export const CollectionBrowser = withPublicComponentWrapper(
  ({ collectionId }: { collectionId: CollectionId }) => {
    return <CollectionItemsTable collectionId={collectionId} />;
  },
);
