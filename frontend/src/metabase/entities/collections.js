/* @flow weak */

import { createEntity, undo } from "metabase/lib/entities";
import { normal, getRandomColor } from "metabase/lib/colors";
import { CollectionSchema } from "metabase/schema";
import { createSelector } from "reselect";

import React from "react";
import CollectionSelect from "metabase/containers/CollectionSelect";

import { t } from "c-3po";

const Collections = createEntity({
  name: "collections",
  path: "/api/collection",
  schema: CollectionSchema,

  objectActions: {
    setArchived: ({ id }, archived, opts) =>
      Collections.actions.update(
        { id },
        { archived },
        undo(opts, "collection", archived ? "archived" : "unarchived"),
      ),

    setCollection: ({ id }, collection, opts) =>
      Collections.actions.update(
        { id },
        { parent_id: canonicalCollectionId(collection && collection.id) },
        undo(opts, "collection", "moved"),
      ),
  },

  selectors: {
    getExpandedCollectionsById: createSelector(
      [state => state.entities.collections],
      collections => getExpandedCollectionsById(Object.values(collections)),
    ),
  },

  objectSelectors: {
    getName: collection => collection && collection.name,
    getUrl: collection =>
      collection &&
      (collection.id === "root" ? `/` : `/collection/${collection.id}`),
    getIcon: collection => "all",
  },

  form: {
    fields: (values = {}) => [
      {
        name: "name",
        placeholder: "My new fantastic collection",
        validate: name =>
          (!name && t`Name is required`) ||
          (name.length > 100 && t`Name must be 100 characters or less`),
      },
      {
        name: "description",
        type: "text",
        placeholder: "It's optional but oh, so helpful",
        normalize: description => description || null, // expected to be nil or non-empty string
      },
      {
        name: "color",
        type: "color",
        initial: () => getRandomColor(normal),
        validate: color => !color && t`Color is required`,
      },
      {
        name: "parent_id",
        title: "Parent collection",
        // eslint-disable-next-line react/display-name
        type: ({ field }) => (
          <CollectionSelect {...field} collectionId={values.id} />
        ),
      },
    ],
  },
});

export default Collections;

// API requires items in "root" collection be persisted with a "null" collection ID
// Also ensure it's parsed as a number
export const canonicalCollectionId = collectionId =>
  collectionId == null || collectionId === "root"
    ? null
    : parseInt(collectionId, 10);

export const ROOT_COLLECTION = {
  id: "root",
  name: "Saved items",
  location: "",
  path: [],
};

// given list of collections with { id, name, location } returns a map of ids to
// expanded collection objects like { id, name, location, path, children }
// including a root collection
export function getExpandedCollectionsById(collections) {
  const collectionsById = {};
  for (const c of collections) {
    collectionsById[c.id] = {
      ...c,
      path:
        c.id === "root"
          ? []
          : c.location != null
            ? ["root", ...c.location.split("/").filter(l => l)]
            : null,
      children: [],
    };
  }

  // make sure we have the root collection with all relevant info
  collectionsById[ROOT_COLLECTION.id] = {
    children: [],
    ...ROOT_COLLECTION,
    ...(collectionsById[ROOT_COLLECTION.id] || {}),
  };

  // iterate over original collections so we don't include ROOT_COLLECTION as
  // a child of itself
  for (const { id } of collections) {
    const c = collectionsById[id];
    if (c.path) {
      const parent = c.path[c.path.length - 1] || "root";
      c.parent = collectionsById[parent];
      // need to ensure the parent collection exists, it may have been filtered
      // because we're selecting a collection's parent collection and it can't
      // contain itself
      if (collectionsById[parent]) {
        collectionsById[parent].children.push(c);
      }
    }
  }
  return collectionsById;
}
