/* @flow */

import { createEntity } from "metabase/lib/entities";

import { SegmentSchema } from "metabase/schema";
import colors from "metabase/lib/colors";

export default createEntity({
  name: "segments",
  path: "/api/segment",
  schema: SegmentSchema,

  objectSelectors: {
    getName: segment => segment && segment.name,
    getUrl: segment => null,
    getColor: () => colors["text-medium"],
    getIcon: question => "segment",
  },
});
