import { type ComponentType, useEffect, useMemo } from "react";
import { t } from "ttag";

import { useTrackSdkComponentMount } from "embedding-sdk-bundle/analytics/component-events";
import {
  CollectionNotFoundError,
  SdkError,
  SdkLoader,
  withPublicComponentWrapper,
} from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import {
  useAllCollectionsItems,
  withRealCollectionId,
} from "embedding-sdk-bundle/hooks/private/use-all-collections-items";
import { useCollectionData } from "embedding-sdk-bundle/hooks/private/use-collection-data";
import { useSdkBreadcrumbs } from "embedding-sdk-bundle/hooks/private/use-sdk-breadcrumb";
import type {
  MetabaseCollectionItem,
  SdkBrowseCollectionId,
} from "embedding-sdk-bundle/types/collection";
import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";
import { COLLECTION_PAGE_SIZE } from "metabase/collections/components/CollectionContent";
import { CollectionItemsTable } from "metabase/collections/components/CollectionContent/CollectionItemsTable";
import { EmptyState } from "metabase/common/components/EmptyState";
import { ItemsTable } from "metabase/common/components/ItemsTable";
import { getVisibleColumnsMap } from "metabase/common/components/ItemsTable/utils";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useLocale } from "metabase/common/hooks/use-locale";
import { usePagination } from "metabase/common/hooks/use-pagination";
import { CollectionBreadcrumbsView } from "metabase/nav/components/CollectionBreadcrumbs/CollectionBreadcrumbsView";
import { collectionToCrumbs } from "metabase/nav/components/CollectionBreadcrumbs/utils";
import { CollectionBreadcrumbs } from "metabase/nav/containers/CollectionBreadcrumbs";
import { Box, Group, Icon, Stack } from "metabase/ui";
import { isNotNull } from "metabase/utils/types";
import type {
  Collection,
  CollectionId,
  CollectionItem,
  CollectionItemModel,
} from "metabase-types/api";
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
 * The API reports "Our analytics" as an ancestor of every top-level collection,
 * the personal one included. Under the virtual root they are siblings, so keep
 * the crumb only for collections really inside it.
 */
const getAllModeBaseCollectionId = (
  collection: Collection,
): CollectionId | null =>
  collection.is_personal || collection.namespace != null ? null : "root";

/**
 * @interface
 * @expand
 * @category CollectionBrowser
 */
export type CollectionBrowserProps = {
  /**
   * The numerical ID of the collection, "personal" for the user's personal collection, "tenant" for the user's tenant collection, or "root" for the root collection. You can find this ID in the URL when accessing a collection in your Metabase instance. For example, the collection ID in `http://localhost:3000/collection/1-my-collection` would be `1`. Use "all" to show everything the user can access: their personal collection plus the shared collections. Defaults to "personal"
   */
  collectionId?: SdkBrowseCollectionId;

  /**
   * The number of items to display per page. The default is 25.
   */
  pageSize?: number;

  /**
   * The types of entities that should be visible. If not provided, all entities will be shown.
   */
  visibleEntityTypes?: UserFacingEntityName[];

  /**
   * Whether to show questions that belong to a dashboard alongside collection saved questions. Set to true to show them. Defaults to false, keeping the list focused on collection content.
   */
  showDashboardQuestions?: boolean;

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
  showDashboardQuestions = false,
  EmptyContentComponent = null,
  visibleColumns = COLLECTION_BROWSER_LIST_COLUMNS,
  className,
  style,
}: CollectionBrowserProps) => {
  useTrackSdkComponentMount("CollectionBrowser", null, {});

  // "all" is a virtual top level, not a collection, so it never reaches a URL
  const isAllMode = collectionId === "all";

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

  const isAtVirtualRoot = isAllMode && effectiveCollectionId == null;

  const {
    items: allCollectionsItems,
    isLoading: isLoadingAllCollections,
    error: allCollectionsError,
  } = useAllCollectionsItems({ enabled: isAtVirtualRoot });

  // The virtual root rows are synthesized, so they carry no edit info and cannot
  // be archived. Those columns would render empty for every row.
  const virtualRootColumnsMap = useMemo(
    () =>
      getVisibleColumnsMap(
        visibleColumns.filter(
          (column) =>
            !["lastEditedBy", "lastEditedAt", "archive"].includes(column),
        ),
      ),
    [visibleColumns],
  );

  // pagination for the virtual root
  const { page, setPage, handleNextPage, handlePreviousPage } = usePagination();

  useEffect(() => {
    setInternalCollectionId(baseCollectionId);
  }, [baseCollectionId, setInternalCollectionId]);

  useEffect(() => {
    if (!isGlobalBreadcrumbEnabled || isFetchingCollection) {
      return;
    }

    if (isAtVirtualRoot) {
      reportLocation({
        type: "all-collections",
        id: "all",
        name: t`All collections`,
      });
      return;
    }

    if (collection) {
      reportLocation({
        type: "collection",
        id: collection.id,
        name: collection.name || "Collection",
      });
    }
  }, [
    isGlobalBreadcrumbEnabled,
    isFetchingCollection,
    isAtVirtualRoot,
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

  if (isAtVirtualRoot && allCollectionsError) {
    return <SdkError message={t`Failed to load collections`} />;
  }

  if (isAtVirtualRoot && isLoadingAllCollections) {
    return <SdkLoader />;
  }

  const onClickItem = (item: MetabaseCollectionItem) => {
    onClick?.(item);

    if (item.model === "collection") {
      setPage(0);

      if (isGlobalBreadcrumbEnabled) {
        reportLocation({
          type: "collection",
          id: item.id,
          name: item.name,
        });
        return;
      }

      setInternalCollectionId(item.id);
    }
  };

  const onClickVirtualRootItem = (item: CollectionItem) =>
    onClickItem(withRealCollectionId(item));

  const collectionTypes = visibleEntityTypes
    .map((entityType) => ENTITY_NAME_MAP[entityType])
    .filter(isNotNull);

  const allModeCrumbs = [
    {
      kind: "static" as const,
      key: "all",
      icon: "collection" as const,
      label: t`All collections`,
      onClick: () => {
        setPage(0);
        setInternalCollectionId(undefined);
      },
    },
    ...(collection
      ? collectionToCrumbs({
          collection,
          baseCollectionId: getAllModeBaseCollectionId(collection),
          onClick: (item) => setInternalCollectionId(item.id),
        })
      : []),
  ];

  const isVirtualRootEmpty =
    isAtVirtualRoot && allCollectionsItems.length === 0;

  const visibleVirtualRootItems = allCollectionsItems.slice(
    page * pageSize,
    (page + 1) * pageSize,
  );

  return (
    <Stack w="100%" h="100%" gap="sm" className={className} style={style}>
      {!isGlobalBreadcrumbEnabled &&
        (isAllMode ? (
          <CollectionBreadcrumbsView path={allModeCrumbs} />
        ) : (
          <CollectionBreadcrumbs
            collectionId={internalCollectionId ?? undefined}
            onClick={(item) => setInternalCollectionId(item.id)}
            baseCollectionId={baseCollectionId}
          />
        ))}

      {isVirtualRootEmpty &&
        (EmptyContentComponent ? (
          <EmptyContentComponent />
        ) : (
          <EmptyState
            title={t`There are no collections to show`}
            illustrationElement={<Icon name="collection" size={100} />}
          />
        ))}

      {isAtVirtualRoot && !isVirtualRootEmpty && (
        <Box w="100%" data-testid="all-collections-list">
          <ItemsTable
            items={visibleVirtualRootItems}
            visibleColumnsMap={virtualRootColumnsMap}
            onClick={onClickVirtualRootItem}
          />

          {allCollectionsItems.length > pageSize && (
            <Group justify="flex-end" my="md">
              <PaginationControls
                showTotal
                page={page}
                pageSize={pageSize}
                total={allCollectionsItems.length}
                itemsLength={visibleVirtualRootItems.length}
                onNextPage={handleNextPage}
                onPreviousPage={handlePreviousPage}
              />
            </Group>
          )}
        </Box>
      )}

      {!isAtVirtualRoot && (
        <CollectionItemsTable
          collectionId={effectiveCollectionId ?? undefined}
          onClick={onClickItem}
          pageSize={pageSize}
          models={collectionTypes}
          showDashboardQuestions={showDashboardQuestions}
          visibleColumns={visibleColumns}
          EmptyContentComponent={EmptyContentComponent ?? undefined}
        />
      )}
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
