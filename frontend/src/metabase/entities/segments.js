/* @flow */

import { createEntity } from "metabase/lib/entities";

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
          revision_message: archived ? "(Archive)" : "(Unarchive)",
        },
        opts,
      ),

    // NOTE: DELETE not currently implemented
    // $FlowFixMe: no official way to disable builtin actions yet
    delete: null,
  },

  objectSelectors: {
    getName: segment => segment && segment.name,
    getUrl: segment => null,
    getColor: () => colors["text-medium"],
    getIcon: question => "segment",
  },

  form: {
    fields: [{ name: "name" }, { name: "description", type: "text" }],
  },
});

export default Segments;
