import { revisionApi, useListRevisionsQuery } from "metabase/api";
import { createEntity, entityCompatibleQuery } from "metabase/lib/entities";

import Dashboards from "./dashboards";
import Questions from "./questions";

const REVERT = "metabase/entities/revisions/REVERT_REVISION";

/**
 * @deprecated use "metabase/api" instead
 */
const Revisions = createEntity({
  name: "revisions",
  rtk: {
    useListQuery: useListRevisionsQuery,
  },
  api: {
    // should use useListRevisionsQuery directly
    list: null,
  },

  actionTypes: {
    REVERT,
  },

  objectActions: {
    // use thunk since we don't actually want to dispatch an action
    revert: (id, entity, revision) => async (dispatch) => {
      await entityCompatibleQuery(
        {
          id,
          entity,
          revision_id: revision.id,
        },
        dispatch,
        revisionApi.endpoints.revertRevision,
      );
      dispatch({ type: REVERT, payload: revision });
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

export default Revisions;
