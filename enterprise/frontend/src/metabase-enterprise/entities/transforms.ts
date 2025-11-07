import { createEntity } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { TransformSchema } from "metabase/schema";
import { color } from "metabase/ui/utils/colors";
import type { Transform } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 * used for search only that relies on .wrapEntity
 */
export const Transforms = createEntity({
  name: "transforms",
  nameOne: "transform",
  path: "/api/ee/transform",
  schema: TransformSchema,

  objectSelectors: {
    getName: (transform: Transform) => transform && transform.name,
    getUrl: (transform: Transform) => transform && Urls.transform(transform.id),
    getColor: () => color("brand"),
  },
});
