import { type ComponentType, useEffect } from "react";
import { t } from "ttag";

import {
  CollectionNotFoundError,
  SdkLoader,
  withPublicComponentWrapper,
} from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { useCollectionData } from "embedding-sdk-bundle/hooks/private/use-collection-data";
import { useSdkBreadcrumbs } from "embedding-sdk-bundle/hooks/private/use-sdk-breadcrumb";
import type {
  MetabaseCollectionItem,
  SdkCollectionId,
} from "embedding-sdk-bundle/types/collection";
import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";
import { COLLECTION_PAGE_SIZE } from "metabase/collections/components/CollectionContent";
import { CollectionItemsTable } from "metabase/collections/components/CollectionContent/CollectionItemsTable";
import EmptyState from "metabase/common/components/EmptyState";
import { useLocale } from "metabase/common/hooks/use-locale";
import { isNotNull } from "metabase/lib/types";
import CollectionBreadcrumbs from "metabase/nav/containers/CollectionBreadcrumbs";
import { Icon, Stack } from "metabase/ui";
import type { CollectionId, CollectionItemModel } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { collectionBrowserPropsSchema } from "./CollectionBrowser.schema";

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
  | "description"
  | "lastEditedBy"
  | "lastEditedAt"
  | "archive";

const COLLECTION_BROWSER_LIST_COLUMNS: CollectionBrowserListColumns[] = [
  "type",
  "name",
  "lastEditedBy",
  "lastEditedAt",
  "archive",
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
   * The numerical ID of the collection, "personal" for the user's personal collection, "tenant" for the user's tenant collection, or "root" for the root collection. You can find this ID in the URL when accessing a collection in your Metabase instance. For example, the collection ID in `http://localhost:3000/collection/1-my-collection` would be `1`. Defaults to "personal"
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
  collectionId,
  onClick,
  pageSize = COLLECTION_PAGE_SIZE,
  visibleEntityTypes = [...USER_FACING_ENTITY_NAMES],
  EmptyContentComponent = null,
  visibleColumns = COLLECTION_BROWSER_LIST_COLUMNS,
  className,
  style,
}: CollectionBrowserProps) => {
  const {
    baseCollectionId,
    internalCollectionId,
    effectiveCollectionId,
    collection,
    isFetchingCollection,
    collectionLoadingError,
    setInternalCollectionId,
  } = useCollectionData(collectionId);

  const { isBreadcrumbEnabled: isGlobalBreadcrumbEnabled, reportLocation } =
    useSdkBreadcrumbs();

  useEffect(() => {
    setInternalCollectionId(baseCollectionId);
  }, [baseCollectionId, setInternalCollectionId]);

  useEffect(() => {
    if (isGlobalBreadcrumbEnabled && !isFetchingCollection && collection) {
      reportLocation({
        type: "collection",
        id: collection.id,
        name: collection.name || "Collection",
      });
    }
  }, [
    isGlobalBreadcrumbEnabled,
    isFetchingCollection,
    collection,
    reportLocation,
  ]);

  if (
    isObject(collectionLoadingError) &&
    collectionLoadingError.status === 403
  ) {
    return (
      <EmptyState
        title={t`You don't have access to this collection`}
        illustrationElement={<Icon name="key" size={100} />}
      />
    );
  }

  const onClickItem = (item: MetabaseCollectionItem) => {
    onClick?.(item);

    if (item.model === "collection") {
      if (isGlobalBreadcrumbEnabled) {
        reportLocation({ type: "collection", id: item.id, name: item.name });
        return;
      }

      setInternalCollectionId(item.id as CollectionId);
    }
  };

  const collectionTypes = visibleEntityTypes
    .map((entityType) => ENTITY_NAME_MAP[entityType])
    .filter(isNotNull);

  return (
    <Stack w="100%" h="100%" gap="sm" className={className} style={style}>
      {!isGlobalBreadcrumbEnabled && (
        <CollectionBreadcrumbs
          collectionId={internalCollectionId}
          onClick={(item) => setInternalCollectionId(item.id)}
          baseCollectionId={baseCollectionId}
        />
      )}

      <CollectionItemsTable
        collectionId={effectiveCollectionId}
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

  if (isLocaleLoading) {
    return <SdkLoader />;
  }

  if (!collectionId) {
    return <CollectionNotFoundError id={collectionId} />;
  }

  return <CollectionBrowserInner collectionId={collectionId} {...restProps} />;
};

export const CollectionBrowser = Object.assign(
  withPublicComponentWrapper(CollectionBrowserWrapper, {
    supportsGuestEmbed: false,
  }),
  { schema: collectionBrowserPropsSchema },
);
