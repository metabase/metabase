import { useMemo } from "react";
import { t } from "ttag";

import type { ObjectWithModel } from "metabase/lib/icon";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { Group, Icon, Text } from "metabase/ui";
import type { Collection } from "metabase-types/api";

export const CollectionAuthorityLevelDisplay = ({
  collection,
}: {
  collection: Collection;
}) => {
  const iconProps = useMemo(() => {
    const icon = PLUGIN_COLLECTIONS.getIcon({
      ...collection,
      model: "collection",
    } as ObjectWithModel);
    return icon;
  }, [collection]);

  if (collection.authority_level !== "official") {
    return null;
  }

  return (
    <Group wrap="nowrap" gap="sm" pb="sm">
      <Icon {...iconProps} />
      <Text lh={1}>{t`Official collection`}</Text>
    </Group>
  );
};
