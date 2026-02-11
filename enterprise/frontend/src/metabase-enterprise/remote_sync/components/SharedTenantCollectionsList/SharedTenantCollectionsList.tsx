import { useFormikContext } from "formik";
import { useCallback, useEffect, useMemo } from "react";
import { usePrevious } from "react-use";
import { c, t } from "ttag";

import { useListCollectionItemsQuery } from "metabase/api";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { Box, Flex, Icon, Loader, Switch, Text } from "metabase/ui";
import type {
  CollectionItem,
  CollectionSyncPreferences,
  RemoteSyncConfigurationSettings,
} from "metabase-types/api";

import { COLLECTIONS_KEY, TYPE_KEY } from "../../constants";

export const SharedTenantCollectionsList = () => {
  const { data, isLoading, error } = useListCollectionItemsQuery({
    id: "root",
    namespace: "shared-tenant-collection",
  });
  const { values, setFieldValue, initialValues } =
    useFormikContext<RemoteSyncConfigurationSettings>();

  const collections = data?.data ?? [];
  const syncMap: CollectionSyncPreferences = useMemo(
    () => values[COLLECTIONS_KEY] ?? {},
    [values],
  );
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
      // Update form state directly via Formik context
      setFieldValue(COLLECTIONS_KEY, {
        ...syncMap,
        [collection.id]: checked,
      });
    },
    [syncMap, setFieldValue],
  );

  if (isLoading) {
    return (
      <Flex justify="center" py="lg">
        <Loader data-testid="loading-indicator" />
      </Flex>
    );
  }

  if (error) {
    return <Text c="error">{t`Failed to load shared tenant collections`}</Text>;
  }

  if (collections.length === 0) {
    return (
      <Text c="text-secondary">{t`No shared tenant collections found`}</Text>
    );
  }

  return (
    <Box
      style={{
        borderRadius: "var(--mantine-radius-md)",
        border: "1px solid var(--mb-color-border)",
        backgroundColor: "var(--mb-color-background-primary)",
        overflow: "hidden",
      }}
    >
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

interface CollectionSyncRowProps {
  collection: CollectionItem;
  isChecked: boolean;
  onToggle: (collection: CollectionItem, checked: boolean) => void;
  isLast: boolean;
  isReadOnly: boolean;
}

const CollectionSyncRow = ({
  collection,
  isChecked,
  onToggle,
  isLast,
  isReadOnly,
}: CollectionSyncRowProps) => {
  const canWrite = collection.can_write ?? false;
  const icon = PLUGIN_COLLECTIONS.getIcon({
    model: "collection",
    is_remote_synced: isChecked,
  });

  return (
    <Box
      p="md"
      style={{
        borderBottom: isLast ? undefined : "1px solid var(--mb-color-border)",
      }}
    >
      <Flex justify="space-between" align="center">
        <Flex align="center" gap="sm">
          <Icon name={icon.name} c={icon.color ?? "text-secondary"} />
          <Text fw="medium">{collection.name}</Text>
        </Flex>
        <Flex align="center" gap="sm">
          <Switch
            size="sm"
            checked={isChecked}
            onChange={(e) => onToggle(collection, e.currentTarget.checked)}
            disabled={!canWrite || isReadOnly}
            aria-label={c("{0} is the name of a metabase collection")
              .t`Sync ${collection.name}`}
          />
          <Text>{t`Sync`}</Text>
        </Flex>
      </Flex>
    </Box>
  );
};
