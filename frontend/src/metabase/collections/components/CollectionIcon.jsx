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
  const icon = getCollectionIcon(collection);
  return <Icon {...icon} {...props} />;
}

CollectionIcon.propTypes = propTypes;
