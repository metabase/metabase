import { useFormikContext } from "formik";
import { useCallback, useEffect, useMemo } from "react";
import { usePrevious } from "react-use";

import { Box, Flex, Loader, Text } from "metabase/ui";
import type {
  CollectionItem,
  CollectionSyncPreferences,
  RemoteSyncConfigurationSettings,
} from "metabase-types/api";

import { COLLECTIONS_KEY, TYPE_KEY } from "../../constants";
import { CollectionSyncRow } from "../CollectionSyncRow";
import { LibrarySyncRow } from "../LibrarySyncRow";
import { TransformsSyncRow } from "../TransformsSyncRow";

import S from "./CollectionSyncList.module.css";

interface CollectionSyncListProps {
  collections: CollectionItem[];
  emptyMessage: string;
  error: string | null;
  isLoading: boolean;
  showTransformsRow?: boolean;
  /**
   * When true and no library collection exists, show a placeholder row for library.
   */
  showLibraryPlaceholder?: boolean;
}

export const CollectionSyncList = ({
  collections,
  emptyMessage,
  error,
  isLoading,
  showTransformsRow,
  showLibraryPlaceholder,
}: CollectionSyncListProps) => {
  const { values, setFieldValue, initialValues } =
    useFormikContext<RemoteSyncConfigurationSettings>();

  const currentType = values[TYPE_KEY];
  const isReadOnly = currentType === "read-only";
  const previousType = usePrevious(currentType);

  // Reset collections to initial values when switching from read-write to read-only
  useEffect(() => {
    if (previousType === "read-write" && currentType === "read-only") {
      setFieldValue(COLLECTIONS_KEY, initialValues[COLLECTIONS_KEY] ?? {});
    }
  }, [currentType, initialValues, setFieldValue, previousType]);

  const handleToggle = useCallback(
    (collection: CollectionItem, checked: boolean) => {
      // Use nested path to avoid stale closure issues with syncMap after form reinitialization
      setFieldValue(`${COLLECTIONS_KEY}.${collection.id}`, checked);
    },
    [setFieldValue],
  );

  const syncRows = useMemo(() => {
    const syncMap: CollectionSyncPreferences = values[COLLECTIONS_KEY] ?? {};
    const rowsItems = collections.map((collection) => (
      <CollectionSyncRow
        key={collection.id}
        collection={collection}
        isChecked={syncMap[collection.id] ?? false}
        onToggle={handleToggle}
        isReadOnly={isReadOnly}
      />
    ));

    if (showLibraryPlaceholder) {
      rowsItems.unshift(
        <LibrarySyncRow key="library-placeholder" isReadOnly={isReadOnly} />,
      );
    }

    if (showTransformsRow) {
      const transformsRow = (
        <TransformsSyncRow key="transforms" isReadOnly={isReadOnly} />
      );
      const libraryIndex = collections.findIndex(
        (collection) => collection.type === "library",
      );

      // Insert transforms row after library collection or placeholder
      if (libraryIndex !== -1) {
        rowsItems.splice(libraryIndex + 1, 0, transformsRow);
      } else if (showLibraryPlaceholder) {
        // Insert after library placeholder (at index 1)
        rowsItems.splice(1, 0, transformsRow);
      } else {
        rowsItems.push(transformsRow);
      }
    }

    return rowsItems;
  }, [
    collections,
    handleToggle,
    isReadOnly,
    showTransformsRow,
    values,
    showLibraryPlaceholder,
  ]);

  if (isLoading) {
    return (
      <Flex justify="center" py="lg">
        <Loader data-testid="loading-indicator" />
      </Flex>
    );
  }

  if (error) {
    return <Text c="error">{error}</Text>;
  }

  if (!syncRows.length) {
    return <Text c="text-secondary">{emptyMessage}</Text>;
  }

  return <Box className={S.collectionSyncList}>{syncRows}</Box>;
};
