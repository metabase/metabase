import { TransformSchema } from "metabase/schema";
import { color } from "metabase/ui/utils/colors";
import { createEntity } from "metabase/utils/entities";
import type { Transform } from "metabase-types/api";

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
    getColor: () => color("brand"),
  },
});
