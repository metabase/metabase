import { t } from "ttag";
import { createSelector } from "reselect";

import { GET } from "metabase/lib/api";
import { createEntity, undo } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";

import { CollectionSchema } from "metabase/schema";
import { getUserPersonalCollectionId } from "metabase/selectors/user";

import { canonicalCollectionId } from "metabase/collections/utils";

import type { Collection } from "metabase-types/api";
import type { GetState, ReduxAction } from "metabase-types/store";

import { getFormSelector } from "./forms";
import getExpandedCollectionsById from "./getExpandedCollectionsById";
import getInitialCollectionId from "./getInitialCollectionId";
import { getCollectionIcon, getCollectionType } from "./utils";

const listCollectionsTree = GET("/api/collection/tree");
const listCollections = GET("/api/collection");

type EntityInCollection = {
  collection?: Collection;
};

const Collections = createEntity({
  name: "collections",
  path: "/api/collection",
  schema: CollectionSchema,

  displayNameOne: t`collection`,
  displayNameMany: t`collections`,

  api: {
    list: async (params: { tree?: boolean }, ...args: any) =>
      params?.tree
        ? listCollectionsTree(params, ...args)
        : listCollections(params, ...args),
  },

  objectActions: {
    setArchived: (
      { id }: Collection,
      archived: boolean,
      opts: Record<string, unknown>,
    ) =>
      Collections.actions.update(
        { id },
        { archived },
        undo(opts, "collection", archived ? "archived" : "unarchived"),
      ),

    setCollection: (
      { id }: Collection,
      collection: Collection,
      opts: Record<string, unknown>,
    ) =>
      Collections.actions.update(
        { id },
        { parent_id: canonicalCollectionId(collection?.id) },
        undo(opts, "collection", "moved"),
      ),

    delete: null,
  },

  objectSelectors: {
    getName: (collection?: Collection) => collection?.name,
    getUrl: (collection?: Collection) => Urls.collection(collection),
    getIcon: (
      item: Collection | EntityInCollection,
      opts: { tooltip?: string },
    ) => {
      const collection =
        (item as EntityInCollection).collection || (item as Collection);
      return getCollectionIcon(collection, opts);
    },
  },

  selectors: {
    getForm: getFormSelector,
    getExpandedCollectionsById: createSelector(
      [state => state.entities.collections || {}, getUserPersonalCollectionId],
      (collections, currentUserPersonalCollectionId) =>
        getExpandedCollectionsById(
          Object.values(collections),
          currentUserPersonalCollectionId,
        ),
    ),
    getInitialCollectionId,
  },

  getAnalyticsMetadata(
    [object]: [Collection],
    { action }: { action: ReduxAction },
    getState: GetState,
  ) {
    const type = object && getCollectionType(object.parent_id, getState());
    return type && `collection=${type}`;
  },
});

export { getExpandedCollectionsById };

export default Collections;
