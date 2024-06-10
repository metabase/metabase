import { useState } from "react";

import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  ALL_MODELS,
  COLLECTION_PAGE_SIZE,
} from "metabase/collections/components/CollectionContent";
import { CollectionItemsTable } from "metabase/collections/components/CollectionContent/CollectionItemsTable";
import CollectionBreadcrumbs from "metabase/nav/containers/CollectionBreadcrumbs/CollectionBreadcrumbs";
import type {
  CollectionEssentials,
  CollectionId,
  CollectionItem,
  CollectionItemModel,
} from "metabase-types/api";

type CollectionBrowserProps = {
  collectionId?: CollectionId;
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
  }: CollectionBrowserProps) => {
    const [currentCollectionId, setCurrentCollectionId] = useState(
      collectionId ?? "root",
    );

    const onClickItem = (item: CollectionItem) => {
      if (onClick) {
        onClick(item);
      }

      if (item.model === "collection") {
        setCurrentCollectionId(item.id);
      }
    };

    const onClickBreadcrumbItem = (item: CollectionEssentials) => {
      setCurrentCollectionId(item.id);
    };

    return (
      <>
        <CollectionBreadcrumbs
          collectionId={currentCollectionId}
          onClick={onClickBreadcrumbItem}
          baseCollectionId={collectionId}
        />
        <CollectionItemsTable
          collectionId={currentCollectionId}
          onClick={onClickItem}
          pageSize={pageSize}
          models={visibleCollectionTypes}
          showActionMenu={false}
        />
      </>
    );
  },
);
