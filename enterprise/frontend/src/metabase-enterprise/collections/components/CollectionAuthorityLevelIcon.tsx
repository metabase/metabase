/* eslint-disable react/prop-types */

import _ from "underscore";

import { color } from "metabase/lib/colors";
import type { CollectionAuthorityLevelIcon as CollectionAuthorityLevelIconComponent } from "metabase/plugins/index";
import { Icon } from "metabase/ui";

import { AUTHORITY_LEVELS } from "../constants";
import { isRegularCollection } from "../utils";

export const CollectionAuthorityLevelIcon: CollectionAuthorityLevelIconComponent =
  ({ collection, tooltip = "default", archived, ...iconProps }) => {
    if (isRegularCollection(collection)) {
      return null;
    }
    const level = AUTHORITY_LEVELS[String(collection.authority_level)];
    const levelColor = level.color ? color(level.color) : undefined;
    const iconColor = archived ? color("text-light") : levelColor;
    return (
      <Icon
        {...iconProps}
        name={level.icon}
        tooltip={level.tooltips?.[tooltip] || tooltip}
        style={{ color: iconColor }}
        data-testid={`${level.type}-collection-marker`}
      />
    );
  };
