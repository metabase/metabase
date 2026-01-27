import { useFormikContext } from "formik";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useListCollectionItemsQuery } from "metabase/api";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { useGetLibraryCollectionQuery } from "metabase-enterprise/api";
import type {
  CollectionItem,
  CollectionSyncPreferences,
  RemoteSyncConfigurationSettings,
} from "metabase-types/api";

import { COLLECTIONS_KEY, TYPE_KEY } from "../../constants";
import { CollectionSyncList } from "../CollectionSyncList";
import { CollectionSyncRow } from "../CollectionSyncRow";
import { TransformsSyncRow } from "../TransformsSyncRow";

export const TopLevelCollectionsList = () => {
  const { values, setFieldValue } =
    useFormikContext<RemoteSyncConfigurationSettings>();
  const syncMap: CollectionSyncPreferences = values[COLLECTIONS_KEY] ?? {};
  const isReadOnly = values[TYPE_KEY] === "read-only";
  const showTransformsRow = PLUGIN_TRANSFORMS.isEnabled;

  const { data, isLoading, error } = useListCollectionItemsQuery({
    id: "root",
    models: ["collection"],
  });

  const { data: libraryCollectionData, isLoading: isLoadingLibrary } =
    useGetLibraryCollectionQuery();

  // Library collection endpoint returns { data: null } when not found
  const libraryCollection: CollectionItem | undefined =
    libraryCollectionData && "name" in libraryCollectionData
      ? libraryCollectionData
      : undefined;

  // Filter out personal collections, analytics collections, and library collection
  // (library is handled separately in headerContent)
  const collections = useMemo(() => {
    return (data?.data ?? []).filter(
      (c) =>
        !c.personal_owner_id &&
        c.type !== "instance-analytics" &&
        c.type !== "library",
    );
  }, [data]);

  const handleToggle = useCallback(
    (collection: CollectionItem, checked: boolean) => {
      setFieldValue(`${COLLECTIONS_KEY}.${collection.id}`, checked);
    },
    [setFieldValue],
  );

  // Build header content: Library (if exists) + Transforms (if enabled)
  const hasOtherCollections = collections.length > 0;

  const buildHeaderContent = () => {
    const items: React.ReactNode[] = [];

    // Library row (first if it exists)
    if (libraryCollection) {
      const isLibraryLast = !showTransformsRow && !hasOtherCollections;
      items.push(
        <CollectionSyncRow
          key="library"
          collection={libraryCollection}
          isChecked={syncMap[libraryCollection.id] ?? false}
          onToggle={handleToggle}
          isLast={isLibraryLast}
          isReadOnly={isReadOnly}
        />,
      );
    }

    // Transforms row (after library, or first if no library)
    if (showTransformsRow) {
      const isTransformsLast = !hasOtherCollections;
      items.push(
        <TransformsSyncRow
          key="transforms"
          isLast={isTransformsLast}
          isReadOnly={isReadOnly}
        />,
      );
    }

    return items.length > 0 ? <>{items}</> : undefined;
  };

  return (
    <CollectionSyncList
      collections={collections}
      isLoading={isLoading || isLoadingLibrary}
      error={error ? t`Failed to load collections` : null}
      emptyMessage={t`No collections found`}
      headerContent={buildHeaderContent()}
    />
  );
};
