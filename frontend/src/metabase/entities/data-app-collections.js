import _ from "underscore";
import { createSelector } from "reselect";

import { createEntity } from "metabase/lib/entities";

import { DataAppCollectionSchema } from "metabase/schema";
import NormalCollections, {
  getExpandedCollectionsById,
} from "metabase/entities/collections";

const DataAppCollections = createEntity({
  name: "dataAppCollections",
  schema: DataAppCollectionSchema,

  api: _.mapObject(
    NormalCollections.api,
    fn =>
      (params, ...opts) =>
        fn({ ...params, namespace: "apps" }, ...opts),
  ),

  selectors: {
    getExpandedCollectionsById: createSelector(
      [
        state => state.entities.dataAppCollections,
        state => {
          const { list } = state.entities.dataAppCollections_list[null] || {};
          return list || [];
        },
      ],
      (collections, collectionsIds) =>
        getExpandedCollectionsById(
          collectionsIds.map(id => collections[id]),
          null,
        ),
    ),
  },

  objectSelectors: {
    getIcon: () => ({ name: "app" }),
  },
});

export default DataAppCollections;
