import Icon, { IconProps } from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

import type { Collection } from "metabase-types/api";

import { AUTHORITY_LEVELS } from "../constants";
import { isRegularCollection } from "../utils";

interface Props extends Omit<IconProps, "name" | "tooltip"> {
  collection: Collection;

  // check OFFICIAL_COLLECTION authority level definition
  // https://github.com/metabase/metabase/blob/d0ab6c0e2361dccfbfe961d61e1066ec2faf6c40/enterprise/frontend/src/metabase-enterprise/collections/constants.js#L14
  tooltip?: "default" | "belonging";
}

export function CollectionAuthorityLevelIcon({
  collection,
  tooltip = "default",
  ...iconProps
}: Props) {
  if (isRegularCollection(collection)) {
    return null;
  }
  const level = AUTHORITY_LEVELS[String(collection.authority_level)];
  return (
    <Icon
      {...iconProps}
      name={level.icon}
      tooltip={level.tooltips?.[tooltip] || tooltip}
      style={{ color: level.color ? color(level.color) : undefined }}
      data-testid={`${level.type}-collection-marker`}
    />
  );
}
