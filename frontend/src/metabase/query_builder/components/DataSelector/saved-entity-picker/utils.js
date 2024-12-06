export const findCollectionById = (collections, collectionId) => {
  if (!collections || collections.length === 0) {
    return null;
  }

  const collection = collections.find(c => c.id === collectionId);

  if (collection) {
    return collection;
  }

  return findCollectionById(
    collections
      .map(c => c.children)
      .filter(Boolean)
      .flat(),
    collectionId,
  );
};
