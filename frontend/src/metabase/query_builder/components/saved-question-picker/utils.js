import { isPersonalCollection } from "metabase/collections/utils";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";

const getCollectionIcon = collection => {
  if (collection.id === PERSONAL_COLLECTIONS.id) {
    return "group";
  }

  return isPersonalCollection(collection) ? "person" : "folder";
};

// FIXME: Collections must be filtered on the back end
export function buildCollectionTree(collections, allowedSchemas) {
  if (collections == null || allowedSchemas.size === 0) {
    return [];
  }

  return collections
    .map(collection => {
      const children = buildCollectionTree(collection.children, allowedSchemas);
      const shouldInclude =
        allowedSchemas.has(collection.originalName || collection.name) ||
        children.length > 0;

      return shouldInclude
        ? {
            id: collection.id,
            name: collection.name,
            schemaName: collection.originalName || collection.name,
            icon: getCollectionIcon(collection),
            children,
          }
        : null;
    })
    .filter(Boolean);
}
