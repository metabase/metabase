import React from "react";
import PropTypes from "prop-types";

import Badge from "metabase/components/Badge";

import Collection from "metabase/entities/collections";

const propTypes = {
  collection: PropTypes.object,
  analyticsContext: PropTypes.string.isRequired,
};

function CollectionBadge({ collection, analyticsContext, ...props }) {
  if (!collection) {
    return null;
  }
  const icon = collection.getIcon();
  return (
    <Badge
      to={collection.getUrl()}
      icon={icon.name}
      iconColor={icon.color}
      data-metabase-event={`${analyticsContext};Collection Badge Click`}
      {...props}
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
  properties: ["name"],
})(CollectionBadge);
