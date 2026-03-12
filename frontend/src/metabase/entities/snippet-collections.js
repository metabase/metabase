import { createSelector } from "@reduxjs/toolkit";
import { t } from "ttag";
import _ from "underscore";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import { canonicalCollectionId } from "metabase/collections/utils";
import {
  Collections,
  getExpandedCollectionsById,
  useListQuery as useListCollectionsQuery,
} from "metabase/entities/collections";
import { createEntity, undo } from "metabase/lib/entities";
import { SnippetCollectionSchema } from "metabase/schema";

/**
 * @deprecated use "metabase/api" instead
 */
export const SnippetCollections = createEntity({
  name: "snippetCollections",
  schema: SnippetCollectionSchema,

  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  displayNameOne: t`snippet collection`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  displayNameMany: t`snippet collections`,

  rtk: {
    getUseGetQuery: () => ({
      useGetQuery,
    }),
    useListQuery,
  },

  api: _.mapObject(
    Collections.api,
    (request) =>
      (opts, ...rest) =>
        request({ ...opts, namespace: "snippets" }, ...rest),
  ),

  objectActions: {
    setArchived: ({ id }, archived, opts) =>
      SnippetCollections.actions.update(
        { id },
        { archived },
        undo(opts, "folder", archived ? "archived" : "unarchived"),
      ),

    setCollection: ({ id }, collection, opts) =>
      SnippetCollections.actions.update(
        { id },
        { parent_id: canonicalCollectionId(collection && collection.id) },
        undo(opts, "folder", "moved"),
      ),

    delete: null, // not implemented
  },

  selectors: {
    getExpandedCollectionsById: createSelector(
      (state) => SnippetCollections.selectors.getList(state) || [],
      (collections) => getExpandedCollectionsById(collections, null),
    ),
  },

  createSelectors: ({ getObject, getFetched }) => ({
    getFetched: (state, props) =>
      getFetched(state, props) || getObject(state, props),
  }),

  getAnalyticsMetadata() {
    return undefined; // not tracking
  },
});

const useGetQuery = (query, options) => {
  return useGetCollectionQuery(
    query === skipToken
      ? skipToken
      : {
          namespace: "snippets",
          ...query,
        },
    options,
  );
};

function useListQuery(query, options) {
  return useListCollectionsQuery({ ...query, namespace: "snippets" }, options);
}
