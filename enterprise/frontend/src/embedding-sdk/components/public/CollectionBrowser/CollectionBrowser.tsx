import { CollectionContent } from "metabase/collections/components/CollectionContent";
import type { CollectionId } from "metabase-types/api";

export const CollectionBrowser = ({
  collectionId,
}: {
  collectionId: CollectionId;
}) => {
  return <CollectionContent collectionId={collectionId} />;
};
