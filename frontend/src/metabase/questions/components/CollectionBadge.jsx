import PropTypes from "prop-types";

import Badge from "metabase/components/Badge";
import Collection from "metabase/entities/collections";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";

const propTypes = {
  className: PropTypes.string,
  collection: PropTypes.object,
  isSingleLine: PropTypes.bool,
  onClick: PropTypes.func,
};

const IRREGULAR_ICON_WIDTH = 16;
const IRREGULAR_ICON_PROPS = {
  width: IRREGULAR_ICON_WIDTH,
  height: 16,

  // Workaround: if a CollectionBadge icon has a tooltip, the default offset x is incorrect
  targetOffsetX: IRREGULAR_ICON_WIDTH,
};

function CollectionBadge({ className, collection, isSingleLine, onClick }) {
  if (!collection) {
    return null;
  }

  const isRegular = PLUGIN_COLLECTIONS.isRegularCollection(collection);
  const icon = {
    ...collection.getIcon(),
    ...(isRegular ? { size: 16 } : IRREGULAR_ICON_PROPS),
  };

  const clickActionProps = onClick ? { onClick } : { to: collection.getUrl() };
  return (
    <Badge
      className={className}
      icon={icon}
      activeColor={icon.color}
      inactiveColor="text-light"
      isSingleLine={isSingleLine}
      {...clickActionProps}
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
