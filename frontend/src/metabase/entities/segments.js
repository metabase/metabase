/* @flow */

import { createEntity } from "metabase/lib/entities";

import { SegmentSchema } from "metabase/schema";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";

import { getMetadata } from "metabase/selectors/metadata";

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

  selectors: {
    getObject: (state, { entityId }) => getMetadata(state).segment(entityId),
  },

  objectSelectors: {
    getName: segment => segment && segment.name,
    getUrl: segment =>
      Urls.tableRowsQuery(
        segment.database_id,
        segment.table_id,
        null,
        segment.id,
      ),
    getColor: segment => color("accent7"),
    getIcon: segment => "segment",
  },

  form: {
    fields: [{ name: "name" }, { name: "description", type: "text" }],
  },
});

export default Segments;
