import { Collection, CollectionId } from "metabase-types/api";

export const getCrumbs = (
  collection: Collection,
  collectionsById: Record<CollectionId, Collection>,
  callback: (id: CollectionId) => void,
) => {
  if (collection && collection.path) {
    return [
      ...collection.path
        .filter(id => collectionsById[id])
        .map(id => [collectionsById[id].name, () => callback(id)]),
      [collection.name],
    ];
  } else {
    return [
      [
        collectionsById["root"].name,
        () => callback(collectionsById["root"].id),
      ],
      ["Unknown"],
    ];
  }
};
