import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListCollectionsQuery } from "metabase/api";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import getExpandedCollectionsById from "metabase/common/collections/getExpandedCollectionsById";
import {
  isLibraryDashboard,
  isPublicCollection,
} from "metabase/common/collections/utils";
import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SelectList } from "metabase/common/components/SelectList";
import type { BaseSelectListItemProps } from "metabase/common/components/SelectList/BaseSelectListItem";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { getCollectionBreadCrumbs } from "metabase/common/utils/collections";
import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
  getUserPersonalCollectionId,
} from "metabase/current-user";
import { useDashboardContext } from "metabase/dashboard/context";
import { getDashboard } from "metabase/dashboard/selectors";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { useGetIcon } from "metabase/hooks/use-icon";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import type { ExpandedCollection } from "metabase/redux/store";
import { Box, Button, Flex, Icon, Input, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type { Collection, CollectionId } from "metabase-types/api";

import { QuestionList } from "./QuestionList";
import S from "./QuestionPicker.module.css";
import { addDashboardQuestion } from "./actions";
import { useCollectionsWithTenants } from "./hooks/use-collections-with-tenants";
import { getLibraryEmptyStateMessage } from "./utils/library";
import {
  COLLECTIONS_TOP_LEVEL_ID,
  SHARED_TENANT_COLLECTIONS_ROOT_ID,
  TENANT_SPECIFIC_COLLECTIONS_ROOT_ID,
} from "./utils/tenant-collection-tree";

interface QuestionPickerProps {
  onSelect: BaseSelectListItemProps["onSelect"];
}

export function QuestionPicker({ onSelect }: QuestionPickerProps) {
  const { data: allCollectionsList = [], isLoading: isLoadingCollections } =
    useListCollectionsQuery();
  const userPersonalCollectionId = useSelector(getUserPersonalCollectionId);
  const baseCollectionsById = useMemo(
    () =>
      getExpandedCollectionsById(allCollectionsList, userPersonalCollectionId),
    [allCollectionsList, userPersonalCollectionId],
  );
  const getIcon = useGetIcon();
  const dispatch = useDispatch();
  const dashboard = useSelector(getDashboard);
  const dashboardCollection = dashboard?.collection ?? ROOT_COLLECTION;
  // a library dashboard may only reference library questions, so it browses
  // and searches the Library's Metrics collection instead of its own tree
  const isLibraryScoped = dashboard != null && isLibraryDashboard(dashboard);
  const libraryMetricsCollection = isLibraryScoped
    ? allCollectionsList.find(isLibraryMetricsRootCollection)
    : undefined;
  const browseRootCollectionId = isLibraryScoped
    ? libraryMetricsCollection?.id
    : dashboardCollection.id;
  const [selectedCollectionId, setSelectedCollectionId] =
    useState<CollectionId>();
  const currentCollectionId = selectedCollectionId ?? browseRootCollectionId;
  const [searchText, setSearchText] = useState("");
  const debouncedSearchText = useDebouncedValue(
    searchText,
    SEARCH_DEBOUNCE_DURATION,
  );

  // getExpandedCollectionsById always creates a root collection,
  // but we only want to show it if the user has access to it.
  const canReadRootCollection = allCollectionsList.some(
    ({ id }) => id === ROOT_COLLECTION.id,
  );

  const collectionsById = useCollectionsWithTenants(
    baseCollectionsById,
    canReadRootCollection,
  );

  const isAtTopLevel = currentCollectionId === COLLECTIONS_TOP_LEVEL_ID;
  const isAtSharedTenantRoot =
    currentCollectionId === SHARED_TENANT_COLLECTIONS_ROOT_ID;
  const isAtTenantSpecificRoot =
    currentCollectionId === TENANT_SPECIFIC_COLLECTIONS_ROOT_ID;
  const collection =
    currentCollectionId != null
      ? collectionsById[currentCollectionId]
      : undefined;
  const crumbs = getCollectionBreadCrumbs(
    libraryMetricsCollection
      ? scopeCollectionPath(
          collection,
          libraryMetricsCollection.id,
          collectionsById,
        )
      : collection,
    collectionsById,
    setSelectedCollectionId,
  );
  const isWaitingForLibrary = isLibraryScoped && isLoadingCollections;
  const canBrowse = currentCollectionId != null;

  const handleSearchTextChange: React.ChangeEventHandler<HTMLInputElement> = (
    e,
  ) => setSearchText(e.target.value);

  const allCollections = (collection && collection.children) || [];
  const showOnlyPublicCollections = isPublicCollection(dashboardCollection);
  const collections = showOnlyPublicCollections
    ? allCollections.filter(isPublicCollection)
    : allCollections;

  const hasDataAccess = useSelector(canUserCreateQueries);
  const hasNativeWrite = useSelector(canUserCreateNativeQueries);

  const { onNewQuestion } = useDashboardContext();
  const onNewNativeQuestion = () => dispatch(addDashboardQuestion("native"));
  return (
    <div className={S.questionPickerRoot}>
      <TextInput
        className={S.searchInput}
        autoFocus
        data-autofocus
        placeholder={t`Search…`}
        value={searchText}
        rightSectionPointerEvents="all"
        rightSection={
          searchText.length > 0 ? (
            <Input.ClearButton
              c="text-secondary"
              onClick={() => setSearchText("")}
            />
          ) : null
        }
        onChange={handleSearchTextChange}
      />

      {(hasDataAccess || hasNativeWrite) && (
        <Flex gap="sm" mb="lg" data-testid="new-button-bar">
          {hasDataAccess && (
            <Button
              w="50%"
              leftSection={<Icon aria-hidden name="insight" />}
              onClick={onNewQuestion}
            >
              {t`New Question`}
            </Button>
          )}
          {hasNativeWrite && !isEmbeddingSdk() && (
            <Button
              w="50%"
              leftSection={<Icon aria-hidden name="sql" />}
              onClick={onNewNativeQuestion}
            >
              {t`New SQL query`}
            </Button>
          )}
        </Flex>
      )}

      {isWaitingForLibrary && <LoadingAndErrorWrapper loading />}

      {!isWaitingForLibrary && !canBrowse && (
        <Box my="4rem">
          <EmptyState message={getLibraryEmptyStateMessage()} icon="folder" />
        </Box>
      )}

      {canBrowse && !debouncedSearchText && (
        <>
          <div className={S.breadcrumbsWrapper}>
            <Breadcrumbs crumbs={crumbs} />
          </div>

          {collections.length > 0 && (
            <SelectList>
              {collections.map((collection) => {
                const icon = getIcon({ ...collection, model: "collection" });
                const iconColor = PLUGIN_COLLECTIONS.isRegularCollection(
                  collection,
                )
                  ? "text-disabled"
                  : icon.color;
                return (
                  <SelectList.Item
                    key={collection.id}
                    id={collection.id}
                    name={collection.name}
                    icon={{
                      ...icon,
                      c: iconColor,
                    }}
                    rightIcon="chevronright"
                    onSelect={(collectionId) =>
                      setSelectedCollectionId(collectionId)
                    }
                  />
                );
              })}
            </SelectList>
          )}
        </>
      )}

      {/* Hide the question list at top-level "Collections" and tenant roots.
          These have fake IDs that don't map to real collections, so querying
          questions against them would fail. */}
      {canBrowse &&
        ((!isAtSharedTenantRoot && !isAtTenantSpecificRoot && !isAtTopLevel) ||
          debouncedSearchText) && (
          <QuestionList
            hasCollections={collections.length > 0}
            searchText={debouncedSearchText}
            collectionId={currentCollectionId}
            searchCollectionId={libraryMetricsCollection?.id}
            onSelect={onSelect}
            showOnlyPublicCollections={showOnlyPublicCollections}
          />
        )}
    </div>
  );
}

function isLibraryMetricsRootCollection(collection: Collection) {
  return collection.type === "library-metrics" && !!collection.is_library_root;
}

// crumbs above the root would let the user browse out of the library, so the
// path is cut at the root; the root itself is not in its own path
function scopeCollectionPath(
  collection: ExpandedCollection | undefined,
  rootCollectionId: CollectionId,
  collectionsById: Partial<Record<CollectionId, ExpandedCollection>>,
): ExpandedCollection | undefined {
  if (!collection?.path) {
    return collection;
  }
  const rootIndex = collection.path.findIndex(
    (id) => collectionsById[id]?.id === rootCollectionId,
  );
  return {
    ...collection,
    path: rootIndex === -1 ? [] : collection.path.slice(rootIndex),
  };
}
