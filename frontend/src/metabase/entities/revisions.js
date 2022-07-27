import { createEntity } from "metabase/lib/entities";

import { GET, POST } from "metabase/lib/api";

const listRevisions = GET("/api/revision");

const ASSOCIATED_ENTITY_TYPES = ["questions", "dashboards"];

const Revision = createEntity({
  name: "revisions",
  api: {
    list: ({ model_type, model_id }, options) =>
      // add model_type and model_id to each object since they are required for revert
      listRevisions({ entity: model_type, id: model_id }).then(revisions =>
        revisions.map(revision => ({
          model_type,
          model_id,
          ...revision,
        })),
      ),
    revert: POST("/api/revision/revert"),
  },

  objectActions: {
    // use thunk since we don't actually want to dispatch an action
    revert: revision => async (dispatch, getState) => {
      await Revision.api.revert({
        entity: revision.model_type,
        id: revision.model_id,
        revision_id: revision.id,
      });

      return dispatch(Revision.actions.invalidateLists());
    },
  },

  actionShouldInvalidateLists(action) {
    if (action) {
      const entities = require("metabase/entities");
      for (const type of ASSOCIATED_ENTITY_TYPES) {
        if (entities[type].actionShouldInvalidateLists(action)) {
          return true;
        }
      }

      return action.type === this.actionTypes.INVALIDATE_LISTS_ACTION;
    }
  },
});

export default Revision;
