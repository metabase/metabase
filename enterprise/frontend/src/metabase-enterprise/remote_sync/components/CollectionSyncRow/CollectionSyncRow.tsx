import { c, t } from "ttag";

import CS from "metabase/css/core/bordered.module.css";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { Box, Flex, Icon, Switch, Text } from "metabase/ui";
import type { CollectionItem } from "metabase-types/api";

interface CollectionSyncRowProps {
  collection: CollectionItem;
  isChecked: boolean;
  onToggle: (collection: CollectionItem, checked: boolean) => void;
  isReadOnly: boolean;
}

export const CollectionSyncRow = ({
  collection,
  isChecked,
  onToggle,
  isReadOnly,
}: CollectionSyncRowProps) => {
  const canWrite = collection.can_write ?? false;
  const icon = PLUGIN_COLLECTIONS.getIcon({
    model: "collection",
    type: collection.type,
    is_remote_synced: isChecked,
  });

  return (
    <Box p="md" className={CS.borderRowDivider}>
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
