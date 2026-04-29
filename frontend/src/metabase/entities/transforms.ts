import { TransformSchema } from "metabase/schema";
import type { Transform } from "metabase-types/api";

import { createEntity } from "./utils";

/**
 * @deprecated use "metabase/api" instead
 * used for search only that relies on .wrapEntity
 */
export const Transforms = createEntity({
  name: "transforms",
  nameOne: "transform",
  path: "/api/transform",
  schema: TransformSchema,

  objectSelectors: {
    getName: (transform: Transform) => transform && transform.name,
  },
});
