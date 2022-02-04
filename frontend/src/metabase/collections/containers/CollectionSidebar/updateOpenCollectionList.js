/**
 * Filters out ids in array of `openCollections` that are the id, or children descendants in the `collections` array of the id passed.
 * @param {number} id must be an integer
 * @param {object[]} collections array of objects
 * @param {number[]} openCollections array of integers
 * @returns {Number[]} Returns array of ids that should be open, that is, display their children..
 */
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
