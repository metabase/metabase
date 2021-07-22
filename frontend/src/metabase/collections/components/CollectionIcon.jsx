import React from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon";
import { getCollectionIcon } from "metabase/entities/collections";

const propTypes = {
  collection: PropTypes.shape({
    authority_level: PropTypes.oneOf(["official"]),
  }),
};

export function CollectionIcon({ collection, ...props }) {
  const { name, color } = getCollectionIcon(collection);
  return <Icon name={name} color={color} {...props} />;
}

CollectionIcon.propTypes = propTypes;
