import type { UnknownAction } from "@reduxjs/toolkit";
import { assocIn } from "icepick";
import _ from "underscore";

import { revisionApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { createThunkAction } from "metabase/redux";
import type {
  Revision,
  RevisionEntityType,
  RevisionId,
} from "metabase-types/api";

type RevisionTargetType = RevisionEntityType | "metric";

export const FETCH_REVISIONS = "metabase/revisions/FETCH_REVISIONS";
export const fetchRevisions = createThunkAction(
  FETCH_REVISIONS,
  (entityType: RevisionTargetType, id: number | string) => {
    return async (dispatch) => {
      const revisions: Revision[] = await runRtkEndpoint(
        {
          id,
          entity: entityType === "metric" ? "legacy-metric" : entityType,
        },
        dispatch,
        revisionApi.endpoints.listRevisions,
      );
      return { type: entityType, id, revisions };
    };
  },
);

type RevisionsState = Record<
  string,
  Record<string | number, Record<RevisionId, Revision>>
>;

type FetchRevisionsPayload = {
  type: RevisionTargetType;
  id: number | string;
  revisions: Revision[];
};

function isFetchRevisionsPayload(
  payload: unknown,
): payload is FetchRevisionsPayload {
  return (
    typeof payload === "object" && payload !== null && "revisions" in payload
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function revisions(
  state: RevisionsState = {},
  action: UnknownAction,
): RevisionsState {
  if (
    action.type === FETCH_REVISIONS &&
    !action.error &&
    isFetchRevisionsPayload(action.payload)
  ) {
    const { type, id, revisions } = action.payload;
    return assocIn(state, [type, id], _.indexBy(revisions, "id"));
  }
  return state;
}
