// FIXME: Collections must be filtered on the back end
export function buildCollectionTree(collections, allowedSchemas) {
  if (collections == null) {
    return [];
  }

  return collections
    .map(collection => {
      const children = buildCollectionTree(collection.children, allowedSchemas);

      const shouldInclude =
        allowedSchemas.has(collection.name) || children.length > 0;

      return shouldInclude
        ? {
            id: collection.id,
            name: collection.name,
            schemaName: collection.name,
            icon: "folder",
            children: buildCollectionTree(collection.children, allowedSchemas),
          }
        : null;
    })
    .filter(Boolean);
}
