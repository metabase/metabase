/* @flow weak */

import { createEntity } from "metabase/lib/entities";
import { normal, getRandomColor } from "metabase/lib/colors";
import { CollectionSchema } from "metabase/schema";

import { t } from "c-3po";

const Collections = createEntity({
  name: "collections",
  path: "/api/collection",
  schema: CollectionSchema,

  objectActions: {
    setArchived: ({ id }, archived) =>
      Collections.actions.update({ id, archived }),
    setCollection: ({ id }, collection) =>
      Collections.actions.update({
        id,
        collection_id: collection && collection.id,
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
    fields: [
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
    ],
  },
});

export default Collections;
