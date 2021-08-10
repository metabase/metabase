import React from "react";
import PropTypes from "prop-types";

import Badge from "metabase/components/Badge";

import Collection from "metabase/entities/collections";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";

const propTypes = {
  collection: PropTypes.object,
  analyticsContext: PropTypes.string.isRequired,
  className: PropTypes.string,
};

function CollectionBadge({ collection, analyticsContext, className }) {
  if (!collection) {
    return null;
  }
  const isRegular = PLUGIN_COLLECTIONS.isRegularCollection(collection);
  const icon = collection.getIcon();
  const iconProps = {
    name: icon.name,
    color: icon.color,
  };
  if (!isRegular) {
    iconProps.width = 14;
    iconProps.height = 16;
  } else {
    iconProps.size = 12;
  }
  return (
    <Badge
      to={collection.getUrl()}
      icon={iconProps}
      activeColor={icon.color}
      className={className}
      data-metabase-event={`${analyticsContext};Collection Badge Click`}
    >
      {collection.getName()}
    </Badge>
  );
}

CollectionBadge.propTypes = propTypes;

export default Collection.load({
  id: (state, props) => props.collectionId || "root",
  wrapped: true,
  loadingAndErrorWrapper: false,
  properties: ["name", "authority_level"],
})(CollectionBadge);
