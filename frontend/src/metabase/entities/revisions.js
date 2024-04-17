import { revisionApi } from "metabase/api";
import { POST } from "metabase/lib/api";
import { createEntity, entityCompatibleQuery } from "metabase/lib/entities";

import Dashboards from "./dashboards";
import Questions from "./questions";

/**
 * @deprecated use "metabase/api" instead
 */
const Revision = createEntity({
  name: "revisions",
  api: {
    list: ({ model_type, model_id }, dispatch) =>
      entityCompatibleQuery(
        { entity: model_type, id: model_id },
        dispatch,
        revisionApi.endpoints.listRevision,
      )
        // add model_type and model_id to each object since they are required for revert
        .then(revisions =>
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
    return (
      action.type === this.actionTypes.INVALIDATE_LISTS_ACTION ||
      Dashboards.actionShouldInvalidateLists(action) ||
      Questions.actionShouldInvalidateLists(action)
    );
  },
});

export default Revision;
