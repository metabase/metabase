/* @flow */

import { createEntity } from "metabase/lib/entities";

import { SegmentSchema } from "metabase/schema";

export default createEntity({
  name: "segments",
  path: "/api/segment",
  schema: SegmentSchema,
});
