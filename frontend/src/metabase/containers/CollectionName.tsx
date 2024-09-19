import Collection, { ROOT_COLLECTION } from "metabase/entities/collections";
import type { CollectionId } from "metabase-types/api";

const CollectionName = ({ id }: { id: CollectionId }) => {
  if (id === "root" || id === null) {
    return <span>{ROOT_COLLECTION.name}</span>;
  } else if (id === undefined || (typeof id === "number" && isNaN(id))) {
    return null;
  } else {
    return <Collection.Name id={id} />;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionName;
