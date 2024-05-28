/* eslint-disable react/prop-types */
import Collection, { ROOT_COLLECTION } from "metabase/entities/collections";

const CollectionName = ({ id }) => {
  if (id === "root" || id === null) {
    return <span>{ROOT_COLLECTION.name}</span>;
  } else if (id === undefined || isNaN(id)) {
    return null;
  } else {
    return <Collection.Name id={id} />;
  }
};

export default CollectionName;
