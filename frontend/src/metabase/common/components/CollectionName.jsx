/* eslint-disable react/prop-types */
import Collections, { ROOT_COLLECTION } from "metabase/entities/collections";

const CollectionName = ({ id }) => {
  if (id === "root" || id === null) {
    return <span>{ROOT_COLLECTION.name}</span>;
  } else if (id === undefined || isNaN(id)) {
    return null;
  } else {
    return <Collections.Name id={id} />;
  }
};

export default CollectionName;
