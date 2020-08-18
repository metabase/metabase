import React from "react";

import Collection, { ROOT_COLLECTION } from "metabase/entities/collections";

const CollectionName = ({ id }) => {
  if (id === undefined || isNaN(id)) {
    return null;
  } else if (id === "root" || id === null) {
    return <span>{ROOT_COLLECTION.name}</span>;
  } else {
    return <Collection.Name id={id} />;
  }
};

export default CollectionName;
