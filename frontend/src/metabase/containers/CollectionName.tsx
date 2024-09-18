/* eslint-disable react/prop-types */
import { CollectionId } from "metabase-types/api";
import Collection, { ROOT_COLLECTION } from "metabase/entities/collections";

const CollectionName = ({ id }: { id: CollectionId }) => {
  if (id === "root" || id === null) {
    return <span>{ROOT_COLLECTION.name}</span>;
  } else if (id === undefined || (typeof id === "number" && isNaN(id))) {
    return null;
  } else {
    return <Collection.Name id={id} />;
  }
};

export default CollectionName;
