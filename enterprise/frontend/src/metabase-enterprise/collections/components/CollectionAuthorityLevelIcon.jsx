import React from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

import { AUTHORITY_LEVELS, REGULAR_COLLECTION } from "../constants";

const propTypes = {
  collection: PropTypes.shape({
    authority_level: PropTypes.oneOf(["official"]),
  }),
};

export function CollectionAuthorityLevelIcon({ collection, ...iconProps }) {
  const level = AUTHORITY_LEVELS[collection.authority_level];
  if (!level || level.type === REGULAR_COLLECTION.type) {
    return null;
  }
  return (
    <Icon
      {...iconProps}
      name={level.icon}
      style={{ color: color(level.color) }}
      data-testid={`${level.type}-collection-marker`}
    />
  );
}

CollectionAuthorityLevelIcon.propTypes = propTypes;
