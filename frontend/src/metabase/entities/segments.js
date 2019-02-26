/* @flow */

import { createEntity, undo } from "metabase/lib/entities";

import { SegmentSchema } from "metabase/schema";
import colors from "metabase/lib/colors";

const Segments = createEntity({
  name: "segments",
  path: "/api/segment",
  schema: SegmentSchema,


    objectActions: {
      setArchived: ({ id }, archived, opts) =>
        Segments.actions.update(
          { id },
          {
            archived,
            // NOTE: this is still required by the endpoint even though we don't really use it
            revision_message: archived ? "(Archive)" : "(Unarchive)"
          },
          opts
        ),
    },

  objectSelectors: {
    getName: segment => segment && segment.name,
    getUrl: segment => null,
    getColor: () => colors["text-medium"],
    getIcon: question => "segment",
  },
});

export default Segments
