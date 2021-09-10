import React from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

import { AUTHORITY_LEVELS } from "../constants";
import { isRegularCollection } from "../utils";

const propTypes = {
  tooltip: PropTypes.string,
  collection: PropTypes.shape({
    authority_level: PropTypes.oneOf(["official"]),
  }),
};

export function CollectionAuthorityLevelIcon({
  collection,
  tooltip = "default",
  ...iconProps
}) {
  if (isRegularCollection(collection)) {
    return null;
  }
  const level = AUTHORITY_LEVELS[collection.authority_level];
  return (
    <Icon
      {...iconProps}
      name={level.icon}
      tooltip={level.tooltips?.[tooltip] || tooltip}
      style={{ color: color(level.color) }}
      data-testid={`${level.type}-collection-marker`}
    />
  );
}

CollectionAuthorityLevelIcon.propTypes = propTypes;
