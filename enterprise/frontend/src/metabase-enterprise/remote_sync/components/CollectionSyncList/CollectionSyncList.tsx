import { useFormikContext } from "formik";
import { type ReactNode, useCallback, useEffect } from "react";
import { usePrevious } from "react-use";

import { Box, Flex, Loader, Text } from "metabase/ui";
import type {
  CollectionItem,
  CollectionSyncPreferences,
  RemoteSyncConfigurationSettings,
} from "metabase-types/api";

import { COLLECTIONS_KEY, TYPE_KEY } from "../../constants";
import { CollectionSyncRow } from "../CollectionSyncRow";

interface CollectionSyncListProps {
  collections: CollectionItem[];
  isLoading: boolean;
  error: string | null;
  emptyMessage: string;
  /** Content rendered at the top of the list (e.g., Library row, Transforms row) */
  headerContent?: ReactNode;
}

export const CollectionSyncList = ({
  collections,
  isLoading,
  error,
  emptyMessage,
  headerContent,
}: CollectionSyncListProps) => {
  const { values, setFieldValue, initialValues } =
    useFormikContext<RemoteSyncConfigurationSettings>();

  const syncMap: CollectionSyncPreferences = values[COLLECTIONS_KEY] ?? {};
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

  const hasAnyContent = collections.length > 0 || headerContent;

  if (!hasAnyContent) {
    return <Text c="text-secondary">{emptyMessage}</Text>;
  }

  return (
    <Box
      bg="background-primary"
      style={{
        borderRadius: "var(--mantine-radius-md)",
        border: "1px solid var(--mb-color-border)",
        overflow: "hidden",
      }}
    >
      {headerContent}
      {collections.map((collection, index) => (
        <CollectionSyncRow
          key={collection.id}
          collection={collection}
          isChecked={syncMap[collection.id] ?? false}
          onToggle={handleToggle}
          isLast={index === collections.length - 1}
          isReadOnly={isReadOnly}
        />
      ))}
    </Box>
  );
};
