import React from "react";
import PropTypes from "prop-types";

import Badge from "metabase/components/Badge";

import Collection from "metabase/entities/collections";

const propTypes = {
  collection: PropTypes.object,
  analyticsContext: PropTypes.string.isRequired,
  className: PropTypes.string,
};

function CollectionBadge({ collection, analyticsContext, className }) {
  if (!collection) {
    return null;
  }
  const icon = collection.getIcon();
  const iconProps = {
    name: icon.name,
    color: icon.color,
  };
  return (
    <Badge
      to={collection.getUrl()}
      icon={iconProps}
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
  properties: ["name"],
})(CollectionBadge);
