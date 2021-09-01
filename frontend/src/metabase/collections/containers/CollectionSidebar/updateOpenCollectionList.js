export function updateOpenCollectionList(id, collections, openCollections) {
  collections.forEach(collection => {
    if (collection.id === id) {
      if (openCollections.includes(id)) {
        openCollections = openCollections.filter(item => item !== id);

        openCollections = removeAllDescendants(
          collection.children,
          openCollections,
        );
      }
    } else if (collection.children) {
      openCollections = updateOpenCollectionList(
        id,
        collection.children,
        openCollections,
      );
    }
  });

  return openCollections;
}

function removeAllDescendants(collections, openCollections) {
  collections.forEach(collection => {
    openCollections = openCollections.filter(item => item !== collection.id);

    if (collection.children) {
      openCollections = removeAllDescendants(
        collection.children,
        openCollections,
      );
    }
  });

  return openCollections;
}
