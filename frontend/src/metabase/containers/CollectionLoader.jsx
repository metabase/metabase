import React from "react";

import EntityObjectLoader from "metabase/entities/containers/EntityObjectLoader";

const CollectionLoader = ({ collectionId, ...props }) => (
  <EntityObjectLoader
    entityType="collections"
    entityId={collectionId}
    {...props}
  />
);

export default CollectionLoader;
