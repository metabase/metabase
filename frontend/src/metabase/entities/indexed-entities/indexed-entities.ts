/**
 * An indexed entity is returned by the search endpoint and points to a single database record in a model
 * This is a special case for entities, because it doesn't have its own API endpoints, but it needs
 * to be treated as an entity (for now at least) so that it will play nicely with search
 */

import { IndexedEntitySchema } from "metabase/schema";
import { createEntity } from "metabase/utils/entities";

/**
 * @deprecated use "metabase/api" instead
 */
export const IndexedEntities = createEntity({
  name: "indexedEntities",
  nameOne: "indexedEntity",
  schema: IndexedEntitySchema,
});
