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
 * The `questions` entity has been removed from the entity framework (its CRUD
 * now lives in `metabase/api/card`), but the normalized slice still needs to:
 *
 * - reflect the latest moderation status when a card is soft-reloaded, and
 * - absorb ad-hoc card values injected by RTK Query consumers.
 *
 * It is registered as the retired-entity reducer for `questions` in
 * `metabase/redux/entities`, where it runs after `handleEntities` has merged any
 * `payload.entities.questions`.
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
