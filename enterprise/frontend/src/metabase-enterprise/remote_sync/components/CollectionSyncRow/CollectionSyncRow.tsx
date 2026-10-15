import { c, t } from "ttag";

import { useGetIcon } from "metabase/hooks/use-icon";
import { Switch, Text } from "metabase/ui";
import type { CollectionItem } from "metabase-types/api";

import { SyncListRow } from "../SyncList";

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
  const getIcon = useGetIcon();
  const canWrite = collection.can_write ?? false;
  const icon = getIcon({
    model: "collection",
    type: collection.type,
    is_remote_synced: isChecked,
  });

  return (
    <SyncListRow
      label={collection.name}
      icon={icon.name}
      iconColor={icon.color}
    >
      <Switch
        checked={isChecked}
        onChange={(e) => onToggle(collection, e.currentTarget.checked)}
        disabled={!canWrite || isReadOnly}
        aria-label={c("{0} is the name of a metabase collection")
          .t`Sync ${collection.name}`}
      />
      <Text>{t`Sync`}</Text>
    </SyncListRow>
  );
};
