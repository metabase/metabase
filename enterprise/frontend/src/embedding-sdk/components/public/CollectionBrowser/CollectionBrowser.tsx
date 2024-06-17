import { type CSSProperties, useState } from "react";

import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import { COLLECTION_PAGE_SIZE } from "metabase/collections/components/CollectionContent";
import { CollectionItemsTable } from "metabase/collections/components/CollectionContent/CollectionItemsTable";
import { isNotNull } from "metabase/lib/types";
import CollectionBreadcrumbs from "metabase/nav/containers/CollectionBreadcrumbs/CollectionBreadcrumbs";
import { Box } from "metabase/ui";
import type {
  CollectionEssentials,
  CollectionId,
  CollectionItem,
  CollectionItemModel,
  RegularCollectionId,
} from "metabase-types/api";

const USER_FACING_ENTITY_NAMES = [
  "collection",
  "dashboard",
  "question",
  "model",
] as const;

type UserFacingEntityName = typeof USER_FACING_ENTITY_NAMES[number];

const ENTITY_NAME_MAP: Partial<
  Record<UserFacingEntityName, CollectionItemModel>
> = {
  collection: "collection",
  dashboard: "dashboard",
  question: "card",
  model: "dataset",
};

type CollectionBrowserProps = {
  collectionId?: RegularCollectionId;
  onClick?: (item: CollectionItem) => void;
  pageSize?: number;
  visibleEntityTypes?: UserFacingEntityName[];
  EmptyContentComponent?: (() => JSX.Element) | null;
  className?: string;
  style?: CSSProperties;
};

export const CollectionBrowserInner = ({
  collectionId = 0,
  onClick,
  pageSize = COLLECTION_PAGE_SIZE,
  visibleEntityTypes = [...USER_FACING_ENTITY_NAMES],
  EmptyContentComponent = null,
  className,
  style,
}: CollectionBrowserProps) => {
  const baseCollectionId = collectionId === 0 ? "root" : collectionId;
  const [currentCollectionId, setCurrentCollectionId] =
    useState<CollectionId>(baseCollectionId);

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

  const collectionTypes = visibleEntityTypes
    .map(entityType => ENTITY_NAME_MAP[entityType])
    .filter(isNotNull);

  return (
    <Box className={className} style={style}>
      <CollectionBreadcrumbs
        collectionId={currentCollectionId}
        onClick={onClickBreadcrumbItem}
        baseCollectionId={baseCollectionId}
      />
      <CollectionItemsTable
        collectionId={currentCollectionId}
        onClick={onClickItem}
        pageSize={pageSize}
        models={collectionTypes}
        showActionMenu={false}
        EmptyContentComponent={EmptyContentComponent}
      />
    </Box>
  );
};

export const CollectionBrowser = withPublicComponentWrapper(
  CollectionBrowserInner,
);
