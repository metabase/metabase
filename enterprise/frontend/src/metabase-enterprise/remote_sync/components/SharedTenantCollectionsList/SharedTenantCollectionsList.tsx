import { t } from "ttag";

import { useUpdateCollectionMutation } from "metabase/api";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { Box, Flex, Icon, Loader, Switch, Text } from "metabase/ui";
import { useListRootTenantCollectionItemsQuery } from "metabase-enterprise/api";
import type { CollectionItem } from "metabase-types/api";

export const SharedTenantCollectionsList = () => {
  const { data, isLoading, error } = useListRootTenantCollectionItemsQuery();
  const [updateCollection] = useUpdateCollectionMutation();

  const collections = data?.data ?? [];

  const handleToggle = async (collection: CollectionItem, checked: boolean) => {
    await updateCollection({ id: collection.id, is_remote_synced: checked });
  };

  if (isLoading) {
    return (
      <Flex justify="center" py="lg">
        <Loader />
      </Flex>
    );
  }

  if (error) {
    return <Text c="error">{t`Failed to load shared tenant collections`}</Text>;
  }

  if (collections.length === 0) {
    return <Text c="text-medium">{t`No shared tenant collections found`}</Text>;
  }

  const totalCount = collections.length;

  return (
    <Box
      style={{
        borderRadius: "var(--mantine-radius-md)",
        border: "1px solid var(--mb-color-border)",
        backgroundColor: "var(--mb-color-bg-white)",
        overflow: "hidden",
      }}
    >
      {collections.map((collection, index) => (
        <CollectionSyncRow
          key={collection.id}
          collection={collection}
          onToggle={handleToggle}
          isLast={index === totalCount - 1}
        />
      ))}
    </Box>
  );
};

interface CollectionSyncRowProps {
  collection: CollectionItem;
  onToggle: (collection: CollectionItem, checked: boolean) => void;
  isLast: boolean;
}

const CollectionSyncRow = ({
  collection,
  onToggle,
  isLast,
}: CollectionSyncRowProps) => {
  const canWrite = collection.can_write ?? false;
  const icon = PLUGIN_COLLECTIONS.getIcon({
    model: "collection",
    is_remote_synced: collection.is_remote_synced,
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
          <Icon name={icon.name} c={icon.color ?? "text-medium"} />
          <Text fw={500}>{collection.name}</Text>
        </Flex>
        <Flex align="center" gap="sm">
          <Switch
            size="sm"
            checked={collection.is_remote_synced ?? false}
            onChange={(e) => onToggle(collection, e.currentTarget.checked)}
            disabled={!canWrite}
          />
          <Text>{t`Sync`}</Text>
        </Flex>
      </Flex>
    </Box>
  );
};
