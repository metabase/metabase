/* eslint-disable react/prop-types */
import React from "react";

import Badge from "metabase/components/Badge";

import Collection from "metabase/entities/collections";

@Collection.load({
  id: (state, props) => props.collectionId || "root",
  wrapped: true,
  loadingAndErrorWrapper: false,
  properties: ["name"],
})
class CollectionBadge extends React.Component {
  render() {
    const { collection, analyticsContext, ...props } = this.props;
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
}

export default CollectionBadge;
