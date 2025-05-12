import { t } from "ttag";

import type { IconProps } from "metabase/ui";
import { Icon } from "metabase/ui";
import type { Collection } from "metabase-types/api";

import { getCollectionType } from "../utils";

interface Props extends Omit<IconProps, "name" | "tooltip"> {
  collection: Collection;
  entity: "collection" | "question" | "model" | "dashboard" | "metric";
}

const collectionIconTooltipNameMap = {
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  collection: t`collection`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  question: t`question`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  model: t`model`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  dashboard: t`dashboard`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  metric: t`metric`,
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
      tooltip={t`This is a read-only Usage Analytics ${collectionIconTooltipNameMap[entity]}.`}
      data-testid="instance-analytics-collection-marker"
    />
  );
}
