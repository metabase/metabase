// FIXME: Collections must be filtered on the back end
export function buildCollectionTree(collections, allowedSchemas) {
  if (collections == null) {
    return [];
  }

  return collections
    .filter(collection => allowedSchemas.has(collection.name))
    .map(collection => ({
      id: collection.id,
      name: collection.name,
      schemaName: collection.name,
      icon: "folder",
      children: buildCollectionTree(collection.children, allowedSchemas),
    }));
}
