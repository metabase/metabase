import React from "react";

import Collection, { ROOT_COLLECTION } from "metabase/entities/collections";

const CollectionName = ({ collectionId }) => {
  if (collectionId === undefined || isNaN(collectionId)) {
    return null;
  } else if (collectionId === "root" || collectionId === null) {
    return <span>{ROOT_COLLECTION.name}</span>;
  } else {
    return <Collection.Name id={collectionId} />;
  }
};

export default CollectionName;
