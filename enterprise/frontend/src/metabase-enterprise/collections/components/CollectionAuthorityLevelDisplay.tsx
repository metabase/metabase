import { useMemo } from "react";
import { t } from "ttag";

import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { Group, Icon, Text } from "metabase/ui";
import type { ObjectWithModel } from "metabase/utils/icon";
import type { Collection } from "metabase-types/api";

export const CollectionAuthorityLevelDisplay = ({
  collection,
}: {
  collection: Collection;
}) => {
  const getIcon = PLUGIN_COLLECTIONS.useGetIcon();
  const iconProps = useMemo(
    () =>
      getIcon({
        ...collection,
        model: "collection",
      } as unknown as ObjectWithModel),
    [collection, getIcon],
  );

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
