export const findCollectionByName = (collections, name) => {
  if (!collections || collections.length === 0) {
    return null;
  }

  const collection = collections.find(c => c.schemaName === name);

  if (collection) {
    return collection;
  }

  return findCollectionByName(
    collections
      .map(c => c.children)
      .filter(Boolean)
      .flat(),
    name,
  );
};
