import _ from "underscore";
import { t } from "ttag";
import { createSelector } from "@reduxjs/toolkit";

import { createEntity, undo } from "metabase/lib/entities";
import { SnippetCollectionSchema } from "metabase/schema";

import NormalCollections, {
  getExpandedCollectionsById,
} from "metabase/entities/collections";

import { canonicalCollectionId } from "metabase/collections/utils";

const SnippetCollections = createEntity({
  name: "snippetCollections",
  schema: SnippetCollectionSchema,

  displayNameOne: t`snippet collection`,
  displayNameMany: t`snippet collections`,

  api: _.mapObject(
    NormalCollections.api,
    request =>
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
      state => SnippetCollections.selectors.getList(state) || [],
      collections => getExpandedCollectionsById(collections, null),
    ),
  },

  createSelectors: ({ getObject, getFetched }) => ({
    getFetched: (state, props) =>
      getFetched(state, props) || getObject(state, props),
  }),

  objectSelectors: {
    getIcon: () => ({ name: "folder" }),
  },

  getAnalyticsMetadata() {
    return undefined; // not tracking
  },
});

export default SnippetCollections;
