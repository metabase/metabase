import React from "react";

import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";
import { ROOT_COLLECTION } from "metabase/entities/collections";

const CollectionNameLoader = entityObjectLoader({
  entityType: "collections",
  properties: ["name"],
  loadingAndErrorWrapper: false,
})(({ object }) => <span>{object && object.name}</span>);

const CollectionName = ({ collectionId }) => {
  if (collectionId === undefined || isNaN(collectionId)) {
    return null;
  } else if (collectionId === "root" || collectionId === null) {
    return <span>{ROOT_COLLECTION.name}</span>;
  } else {
    return <CollectionNameLoader entityId={collectionId} />;
  }
};

export default CollectionName;
