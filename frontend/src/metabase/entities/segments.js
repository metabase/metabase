/* @flow */

import { createEntity } from "metabase/lib/entities";

import { SegmentSchema } from "metabase/schema";
import colors from "metabase/lib/colors";

const Segments = createEntity({
  name: "segments",
  nameOne: "segment",
  path: "/api/segment",
  schema: SegmentSchema,

  objectActions: {
    setArchived: (
      { id },
      archived,
      { revision_message = archived ? "(Archive)" : "(Unarchive)" } = {},
    ) => Segments.actions.update({ id }, { archived, revision_message }),

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
