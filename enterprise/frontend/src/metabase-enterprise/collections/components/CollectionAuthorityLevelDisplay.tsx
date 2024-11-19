import { useMemo } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
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
    if (icon.color) {
      icon.color = color(icon.color);
    }
    return icon;
  }, [collection]);

  if (collection.authority_level !== "official") {
    return null;
  }

  return (
    <Group noWrap spacing="sm" pb="sm">
      <Icon {...iconProps} />
      <Text lh={1}>{t`Official collection`}</Text>
    </Group>
  );
};
