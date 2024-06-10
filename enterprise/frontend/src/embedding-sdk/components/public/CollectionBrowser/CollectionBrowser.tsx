import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  ALL_MODELS,
  COLLECTION_PAGE_SIZE,
} from "metabase/collections/components/CollectionContent";
import { CollectionItemsTable } from "metabase/collections/components/CollectionContent/CollectionItemsTable";
import type {
  CollectionId,
  CollectionItem,
  CollectionItemModel,
} from "metabase-types/api";

type CollectionBrowserProps = {
  collectionId: CollectionId;
  onClick?: (item: CollectionItem) => void;
  pageSize?: number;
  visibleCollectionTypes?: CollectionItemModel[];
};

export const CollectionBrowser = withPublicComponentWrapper(
  ({
    collectionId,
    onClick,
    pageSize = COLLECTION_PAGE_SIZE,
    visibleCollectionTypes = ALL_MODELS,
  }: CollectionBrowserProps) => (
    <CollectionItemsTable
      collectionId={collectionId}
      onClick={onClick}
      pageSize={pageSize}
      models={visibleCollectionTypes}
      showActionMenu={false}
    />
  ),
);
