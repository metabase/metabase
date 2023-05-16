import { createEntity } from "metabase/lib/entities";

import { GET } from "metabase/lib/api";
import { entityTypeForObject } from "metabase/lib/schema";

import { ObjectUnionSchema } from "metabase/schema";

import { canonicalCollectionId } from "metabase/collections/utils";

import Actions from "./actions";
import Bookmarks from "./bookmarks";
import Collections from "./collections";
import Dashboards from "./dashboards";
import Metrics from "./metrics";
import Pulses from "./pulses";
import Questions from "./questions";
import Segments from "./segments";
import Snippets from "./snippets";
import SnippetCollections from "./snippet-collections";

const searchList = GET("/api/search");
const collectionList = GET("/api/collection/:collection/items");

export default createEntity({
  name: "search",
  path: "/api/search",

  api: {
    list: async (query = {}) => {
      if (query.collection) {
        const {
          collection,
          archived,
          models,
          namespace,
          pinned_state,
          limit,
          offset,
          sort_column,
          sort_direction,
          ...unsupported
        } = query;
        if (Object.keys(unsupported).length > 0) {
          throw new Error(
            "search with `collection` filter does not support these filters: " +
              Object.keys(unsupported).join(", "),
          );
        }

        const { data, ...rest } = await collectionList({
          collection,
          archived,
          models,
          namespace,
          pinned_state,
          limit,
          offset,
          sort_column,
          sort_direction,
        });

        return {
          ...rest,
          data: data
            ? data.map(item => ({
                collection_id: canonicalCollectionId(collection),
                archived: archived || false,
                ...item,
              }))
            : [],
        };
      } else {
        return searchList(query);
      }
    },
  },

  schema: ObjectUnionSchema,

  // delegate to the actual object's entity wrapEntity
  wrapEntity(object, dispatch = null) {
    const entities = require("metabase/entities");
    const entity = entities[entityTypeForObject(object)];
    if (entity) {
      return entity.wrapEntity(object, dispatch);
    } else {
      console.warn("Couldn't find entity for object", object);
      return object;
    }
  },

  // delegate to each entity's actionShouldInvalidateLists
  actionShouldInvalidateLists(action) {
    return (
      Actions.actionShouldInvalidateLists(action) ||
      Bookmarks.actionShouldInvalidateLists(action) ||
      Collections.actionShouldInvalidateLists(action) ||
      Dashboards.actionShouldInvalidateLists(action) ||
      Metrics.actionShouldInvalidateLists(action) ||
      Pulses.actionShouldInvalidateLists(action) ||
      Questions.actionShouldInvalidateLists(action) ||
      Segments.actionShouldInvalidateLists(action) ||
      Snippets.actionShouldInvalidateLists(action) ||
      SnippetCollections.actionShouldInvalidateLists(action)
    );
  },
});
