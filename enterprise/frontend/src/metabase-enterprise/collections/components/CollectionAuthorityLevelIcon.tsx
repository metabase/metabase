/* eslint-disable react/prop-types */

import _ from "underscore";

import { color } from "metabase/lib/colors";
import type { CollectionAuthorityLevelIcon as CollectionAuthorityLevelIconComponent } from "metabase/plugins/index";
import { FixedSizeIcon as Icon } from "metabase/ui";

import { AUTHORITY_LEVELS } from "../constants";
import { isRegularCollection } from "../utils";

export const CollectionAuthorityLevelIcon: CollectionAuthorityLevelIconComponent =
  ({
    collection,
    tooltip = "default",
    archived,
    showIconForRegularCollection,
    ...iconProps
  }) => {
    if (isRegularCollection(collection) && !showIconForRegularCollection) {
      return null;
    }
    const level = AUTHORITY_LEVELS[String(collection.authority_level)];
    const levelColor = level.color ? color(level.color) : undefined;
    const iconColor = archived ? "var(--mb-color-text-light)" : levelColor;
    return (
      <Icon
        {...iconProps}
        name={level.icon}
        tooltip={level.tooltips?.[tooltip] || undefined}
        style={{ color: iconColor }}
        data-testid={`${level.type}-collection-marker`}
      />
    );
  };
