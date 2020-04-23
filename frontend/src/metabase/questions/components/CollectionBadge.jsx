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
    return (
      <Badge
        to={collection.getUrl()}
        icon={collection.getIcon()}
        data-metabase-event={`${analyticsContext};Collection Badge Click`}
        {...props}
      >
        {collection.getName()}
      </Badge>
    );
  }
}

export default CollectionBadge;
