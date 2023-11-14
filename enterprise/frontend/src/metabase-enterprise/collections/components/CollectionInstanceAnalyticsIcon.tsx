import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import type { IconProps } from "metabase/core/components/Icon";

import type { Collection } from "metabase-types/api";
import { getCollectionType } from "../utils";

interface Props extends Omit<IconProps, "name" | "tooltip"> {
  collection: Collection;
  entity: "collection" | "question" | "model" | "dashboard";
}

const collectionIconTooltipNameMap = {
  collection: t`collection`,
  question: t`question`,
  model: t`model`,
  dashboard: t`dashboard`,
};

export function CollectionInstanceAnalyticsIcon({
  collection,
  entity,
  ...iconProps
}: Props) {
  const collectionType = getCollectionType(collection);

  if (collectionType.type !== "instance-analytics") {
    return null;
  }

  return (
    <Icon
      {...iconProps}
      name={collectionType.icon}
      tooltip={t`This is a read-only Instance Analytics ${collectionIconTooltipNameMap[entity]}.`}
      data-testid="instance-analytics-collection-marker"
    />
  );
}
