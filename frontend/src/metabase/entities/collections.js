/* @flow weak */

import { createEntity, undo } from "metabase/lib/entities";
import { normal, getRandomColor } from "metabase/lib/colors";
import { CollectionSchema } from "metabase/schema";

import React from "react";
import CollectionSelect from "metabase/containers/CollectionSelect";

import { t } from "c-3po";

const Collections = createEntity({
  name: "collections",
  path: "/api/collection",
  schema: CollectionSchema,

  objectActions: {
    @undo("collection", (o, archived) => (archived ? "archived" : "unarchived"))
    setArchived: ({ id }, archived) =>
      Collections.actions.update({ id, archived }),

    @undo("collection", "moved")
    setCollection: ({ id }, collection) =>
      Collections.actions.update({
        id,
        parent_id: collection && collection.id,
      }),
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

export const ROOT_COLLECTION = {
  id: "root",
  name: "Saved Items",
  location: "",
};

// given list of collections with { id, name, location } returns a map of ids to
// expanded collection objects like { id, name, location, path, children }
// including a root collection
export function getCollectionsById(collections) {
  const collectionsById = {};
  for (const c of collections.concat([ROOT_COLLECTION])) {
    collectionsById[c.id] = {
      ...c,
      path:
        c.id === "root"
          ? []
          : ["root", ...c.location.split("/").filter(l => l)],
      children: [],
    };
  }
  // iterate over original collections so we don't include ROOT_COLLECTION as
  // a child of itself
  for (const { id } of collections) {
    const c = collectionsById[id];
    const parent = c.path[c.path.length - 1] || "root";
    // need to ensure the parent collection exists, it may have been filtered
    // because we're selecting a collection's parent collection and it can't
    // contain itself
    if (collectionsById[parent]) {
      collectionsById[parent].children.push(c);
    }
  }
  return collectionsById;
}
