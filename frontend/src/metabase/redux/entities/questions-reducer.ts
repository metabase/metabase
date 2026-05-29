import { updateIn } from "icepick";

import { SOFT_RELOAD_CARD } from "metabase/redux/query-builder";

/**
 * Dispatched (with a card payload) to merge freshly-fetched RTK Query card data
 * into the normalized `state.entities.questions` slice, so `getMetadata` sees it.
 */
export const INJECT_RTK_QUERY_QUESTION_VALUE =
  "metabase/entities/questions/FETCH_ADHOC_METADATA";

type QuestionState = Record<string, any>;
type ReducerAction = { type: string; payload?: any };

/**
 * Reducer for the `state.entities.questions` slice.
 *
 * Questions no longer go through the entity framework — CRUD lives in
 * `metabase/api/card`. The slice itself is still consumed by `getMetadata` in
 * `metabase/selectors/metadata.ts`, so we keep it in sync when:
 *
 * - a card is soft-reloaded (to reflect the latest moderation status), and
 * - an RTK Query consumer injects ad-hoc card values via
 *   `INJECT_RTK_QUERY_QUESTION_VALUE`.
 *
 * It runs after the generic slice reducer in `./index` has merged any
 * `payload.entities.questions` from `metabase/entities/*` actions.
 */
export function questionsReducer(
  state: QuestionState = {},
  { type, payload }: ReducerAction,
): QuestionState {
  if (type === SOFT_RELOAD_CARD) {
    const { id } = payload;
    const latestReview = payload.moderation_reviews?.find(
      (review: { most_recent?: boolean }) => review.most_recent,
    );

    if (latestReview) {
      return updateIn(state, [id], (question) => ({
        ...question,
        moderated_status: latestReview.status,
      }));
    }
  }

  if (type === INJECT_RTK_QUERY_QUESTION_VALUE) {
    const { id } = payload;

    return updateIn(state, [id], (question) => ({ ...question, ...payload }));
  }

  return state;
}
