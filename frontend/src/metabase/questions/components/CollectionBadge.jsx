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

const IRREGULAR_ICON_WIDTH = 14;
const IRREGULAR_ICON_PROPS = {
  width: IRREGULAR_ICON_WIDTH,
  height: 16,

  // Workaround: if a CollectionBadge icon has a tooltip, the default offset x is incorrect
  targetOffsetX: IRREGULAR_ICON_WIDTH,
};

function CollectionBadge({ collection, analyticsContext, className }) {
  if (!collection) {
    return null;
  }
  const isRegular = PLUGIN_COLLECTIONS.isRegularCollection(collection);
  const icon = {
    ...collection.getIcon(),
    ...(isRegular ? { size: 12 } : IRREGULAR_ICON_PROPS),
  };
  return (
    <Badge
      to={collection.getUrl()}
      icon={icon}
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
