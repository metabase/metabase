import { type ComponentType, useEffect, useMemo, useState } from "react";

import {
  CollectionNotFoundError,
  SdkLoader,
  withPublicComponentWrapper,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { useSdkBreadcrumb } from "embedding-sdk/hooks/private/use-sdk-breadcrumb";
import { useTranslatedCollectionId } from "embedding-sdk/hooks/private/use-translated-collection-id";
import { getCollectionIdSlugFromReference } from "embedding-sdk/store/collections";
import { useSdkSelector } from "embedding-sdk/store/use-sdk-selector";
import type {
  MetabaseCollectionItem,
  SdkCollectionId,
} from "embedding-sdk/types/collection";
import type { CommonStylingProps } from "embedding-sdk/types/props";
import { useGetCollectionQuery } from "metabase/api";
import { COLLECTION_PAGE_SIZE } from "metabase/collections/components/CollectionContent";
import { CollectionItemsTable } from "metabase/collections/components/CollectionContent/CollectionItemsTable";
import { useLocale } from "metabase/common/hooks/use-locale";
import { isNotNull } from "metabase/lib/types";
import { Stack } from "metabase/ui";
import type { CollectionId, CollectionItemModel } from "metabase-types/api";

const USER_FACING_ENTITY_NAMES = [
  "collection",
  "dashboard",
  "question",
  "model",
] as const;

type UserFacingEntityName = (typeof USER_FACING_ENTITY_NAMES)[number];

export type CollectionBrowserListColumns =
  | "type"
  | "name"
  | "lastEditedBy"
  | "lastEditedAt";

const COLLECTION_BROWSER_LIST_COLUMNS: CollectionBrowserListColumns[] = [
  "type",
  "name",
  "lastEditedBy",
  "lastEditedAt",
];

const ENTITY_NAME_MAP: Partial<
  Record<UserFacingEntityName, CollectionItemModel>
> = {
  collection: "collection",
  dashboard: "dashboard",
  question: "card",
  model: "dataset",
};

/**
 * @interface
 * @expand
 * @category CollectionBrowser
 */
export type CollectionBrowserProps = {
  /**
   * The numerical ID of the collection, "personal" for the user's personal collection, or "root" for the root collection. You can find this ID in the URL when accessing a collection in your Metabase instance. For example, the collection ID in `http://localhost:3000/collection/1-my-collection` would be `1`. Defaults to "personal"
   */
  collectionId?: SdkCollectionId;

  /**
   * The number of items to display per page. The default is 25.
   */
  pageSize?: number;

  /**
   * The types of entities that should be visible. If not provided, all entities will be shown.
   */
  visibleEntityTypes?: UserFacingEntityName[];

  /**
   * The columns to display in the collection items table. If not provided, all columns will be shown.
   */
  visibleColumns?: CollectionBrowserListColumns[];

  /**
   * A component to display when there are no items in the collection.
   */
  EmptyContentComponent?: ComponentType | null;

  /**
   * A function to call when an item is clicked.
   */
  onClick?: (item: MetabaseCollectionItem) => void;
} & CommonStylingProps;

export const CollectionBrowserInner = ({
  collectionId = "personal",
  onClick,
  pageSize = COLLECTION_PAGE_SIZE,
  visibleEntityTypes = [...USER_FACING_ENTITY_NAMES],
  EmptyContentComponent = null,
  visibleColumns = COLLECTION_BROWSER_LIST_COLUMNS,
  className,
  style,
}: Omit<CollectionBrowserProps, "collectionId"> & {
  collectionId: CollectionId;
}) => {
  const baseCollectionId = useSdkSelector((state) =>
    getCollectionIdSlugFromReference(state, collectionId),
  );

  const [currentCollectionId, setCurrentCollectionId] =
    useState<CollectionId>(baseCollectionId);

  const { breadcrumbs, updateCurrentLocation } = useSdkBreadcrumb({
    consumer: "collection",
  });

  const { data: currentCollection, isFetching: isFetchingCollection } =
    useGetCollectionQuery({ id: currentCollectionId });

  const latestBreadcrumbCollection = useMemo(() => {
    return breadcrumbs[breadcrumbs.length - 1];
  }, [breadcrumbs]);

  useEffect(() => {
    setCurrentCollectionId(baseCollectionId);
  }, [baseCollectionId]);

  // Update the breadcrumb when collection changes.
  // This cannot be done in onClickItem as we need to populate the
  // initial collection's name in the breadcrumb.
  useEffect(() => {
    if (currentCollection && !isFetchingCollection) {
      updateCurrentLocation({
        type: "collection",
        id: currentCollection.id,
        name: currentCollection.name,
      });
    }
  }, [currentCollection, updateCurrentLocation, isFetchingCollection]);

  const onClickItem = (item: MetabaseCollectionItem) => {
    onClick?.(item);

    if (item.model === "collection") {
      setCurrentCollectionId(item.id as CollectionId);
    }
  };

  const collectionTypes = visibleEntityTypes
    .map((entityType) => ENTITY_NAME_MAP[entityType])
    .filter(isNotNull);

  return (
    <Stack w="100%" h="100%" gap="sm" className={className} style={style}>
      <div>{`collectionId = ${currentCollectionId}`}</div>
      <div>{`latestBreadcrumbCollection = ${latestBreadcrumbCollection?.id}`}</div>

      <CollectionItemsTable
        collectionId={currentCollectionId}
        onClick={onClickItem}
        pageSize={pageSize}
        models={collectionTypes}
        visibleColumns={visibleColumns}
        EmptyContentComponent={EmptyContentComponent ?? undefined}
      />
    </Stack>
  );
};

const CollectionBrowserWrapper = ({
  collectionId = "personal",
  ...restProps
}: CollectionBrowserProps) => {
  const { isLocaleLoading } = useLocale();
  const { id, isLoading } = useTranslatedCollectionId({
    id: collectionId,
  });

  if (isLocaleLoading || isLoading) {
    return <SdkLoader />;
  }

  if (!id) {
    return <CollectionNotFoundError id={collectionId} />;
  }

  return <CollectionBrowserInner collectionId={id} {...restProps} />;
};

/**
 * A component that allows you to browse collections and their items.
 *
 * @function
 * @category CollectionBrowser
 */
export const CollectionBrowser = withPublicComponentWrapper(
  CollectionBrowserWrapper,
);
