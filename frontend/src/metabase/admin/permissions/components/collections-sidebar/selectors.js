import { createSelector } from "reselect";
import { t } from "ttag";

import Collections, { ROOT_COLLECTION } from "metabase/entities/collections";
import { nonPersonalOrArchivedCollection } from "metabase/collections/utils";

const getCollectionsTree = (state, _props) => {
  const collections =
    Collections.selectors.getList(state, {
      entityQuery: { tree: true },
    }) || [];
  const nonPersonalCollections = collections.filter(
    nonPersonalOrArchivedCollection,
  );

  return [ROOT_COLLECTION, ...nonPersonalCollections];
};

export const getCollectionsSidebar = createSelector(
  getCollectionsTree,
  collectionsTree => {
    return {
      title: t`Collections`,
      entityGroups: [collectionsTree || []],
      filterPlaceholder: t`Search for a collection`,
    };
  },
);
