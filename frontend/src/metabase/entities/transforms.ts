import { TransformSchema } from "metabase/schema";

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
});
