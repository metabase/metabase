/* @flow */
import _ from "underscore";
import { t } from "ttag";
import { createSelector } from "reselect";

import { color } from "metabase/lib/colors";
import { createEntity, undo } from "metabase/lib/entities";
import { SnippetCollectionSchema } from "metabase/schema";
import NormalCollections, {
  canonicalCollectionId,
  getExpandedCollectionsById,
} from "metabase/entities/collections";

const SnippetCollections = createEntity({
  name: "snippetCollections",
  schema: SnippetCollectionSchema,

  api: _.mapObject(NormalCollections.api, f => (first, ...rest) =>
    f({ ...first, namespace: "snippets" }, ...rest),
  ),

  displayNameOne: t`snippet collection`,
  displayNameMany: t`snippet collections`,

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

    // NOTE: DELETE not currently implemented
    // $FlowFixMe: no official way to disable builtin actions yet
    delete: null,
  },

  selectors: {
    getExpandedCollectionsById: createSelector(
      [
        state => state.entities.snippetCollections,
        state => state.entities.snippetCollections_list[null] || [],
      ],
      (collections, collectionsIds) =>
        getExpandedCollectionsById(
          collectionsIds.map(id => collections[id]),
          null,
        ),
    ),
  },

  createSelectors: ({ getObject, getFetched }) => ({
    getFetched: (state, props) =>
      getFetched(state, props) || getObject(state, props),
  }),

  objectSelectors: {
    getIcon: collection => "folder",
  },

  form: {
    fields: [
      {
        name: "name",
        title: t`Give your folder a name`,
        placeholder: t`Something short but sweet`,
        validate: name =>
          (!name && t`Name is required`) ||
          (name && name.length > 100 && t`Name must be 100 characters or less`),
      },
      {
        name: "description",
        title: t`Add a description`,
        type: "text",
        placeholder: t`It's optional but oh, so helpful`,
        normalize: description => description || null, // expected to be nil or non-empty string
      },
      {
        name: "color",
        title: t`Color`,
        type: "hidden",
        initial: () => color("brand"),
        validate: color => !color && t`Color is required`,
      },
      {
        name: "parent_id",
        title: t`Folder this should be in`,
        type: "snippetCollection",
        normalize: canonicalCollectionId,
      },
    ],
  },

  getAnalyticsMetadata([object], { action }, getState) {
    return undefined; // TODO: is there anything informative to track here?
  },
});

export default SnippetCollections;
