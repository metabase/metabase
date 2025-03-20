import {
  type CSSProperties,
  type ComponentType,
  useEffect,
  useState,
} from "react";

import {
  CollectionNotFoundError,
  SdkLoader,
  withPublicComponentWrapper,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  type SDKCollectionReference,
  getCollectionIdSlugFromReference,
} from "embedding-sdk/store/collections";
import { useSdkSelector } from "embedding-sdk/store/use-sdk-selector";
import { COLLECTION_PAGE_SIZE } from "metabase/collections/components/CollectionContent";
import { CollectionItemsTable } from "metabase/collections/components/CollectionContent/CollectionItemsTable";
import { useValidatedEntityId } from "metabase/lib/entity-id/hooks/use-validated-entity-id";
import { isNotNull } from "metabase/lib/types";
import CollectionBreadcrumbs from "metabase/nav/containers/CollectionBreadcrumbs/CollectionBreadcrumbs";
import { Stack } from "metabase/ui";
import type {
  CollectionEssentials,
  CollectionId,
  CollectionItem,
  CollectionItemModel,
} from "metabase-types/api";

const USER_FACING_ENTITY_NAMES = [
  "collection",
  "dashboard",
  "question",
  "model",
] as const;

type UserFacingEntityName = (typeof USER_FACING_ENTITY_NAMES)[number];

type CollectionBrowserListColumns =
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

export type CollectionBrowserProps = {
  collectionId?: SDKCollectionReference;
  onClick?: (item: CollectionItem) => void;
  pageSize?: number;
  visibleEntityTypes?: UserFacingEntityName[];
  EmptyContentComponent?: ComponentType | null;
  visibleColumns?: CollectionBrowserListColumns[];
  className?: string;
  style?: CSSProperties;
};

export const CollectionBrowserInner = ({
  collectionId = "personal",
  onClick,
  pageSize = COLLECTION_PAGE_SIZE,
  visibleEntityTypes = [...USER_FACING_ENTITY_NAMES],
  EmptyContentComponent = null,
  visibleColumns = COLLECTION_BROWSER_LIST_COLUMNS,
  className,
  style,
}: CollectionBrowserProps) => {
  const baseCollectionId = useSdkSelector(state =>
    getCollectionIdSlugFromReference(state, collectionId),
  );

  const [currentCollectionId, setCurrentCollectionId] =
    useState<CollectionId>(baseCollectionId);

  useEffect(() => {
    setCurrentCollectionId(baseCollectionId);
  }, [baseCollectionId]);

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
    <Stack w="100%" h="100%" gap="sm" className={className} style={style}>
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
  const { id, isLoading } = useValidatedEntityId<
    "collection",
    SDKCollectionReference
  >({
    type: "collection",
    id: collectionId,
  });

  if (isLoading) {
    return <SdkLoader />;
  }

  const isValidId =
    id ||
    typeof collectionId === "number" ||
    collectionId === "personal" ||
    collectionId === "root";

  if (!isValidId) {
    return <CollectionNotFoundError id={collectionId} />;
  }

  return (
    <CollectionBrowserInner collectionId={id ?? collectionId} {...restProps} />
  );
};

export const CollectionBrowser = withPublicComponentWrapper(
  CollectionBrowserWrapper,
);
