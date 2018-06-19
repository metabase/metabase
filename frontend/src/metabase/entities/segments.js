/* @flow */

import { createEntity } from "metabase/lib/entities";

import { SegmentSchema } from "metabase/schema";

export default createEntity({
  name: "segments",
  path: "/api/segment",
  schema: SegmentSchema,

  objectSelectors: {
    getName: segment => segment && segment.name,
    getUrl: segment => null,
    getColor: () => "#93B3C9",
    getIcon: question => "segment",
  },
});
