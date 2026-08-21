import { cardApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import type { Dispatch } from "metabase/redux/store";
import type {
  Card,
  CreateCardRequest,
  UpdateCardRequest,
} from "metabase-types/api";

/**
 * Card lifecycle events dispatched by the create/update thunks below. They let
 * the retired-entity reducers stay in sync after a card is written — the
 * `tables` slice keeps the `card__<id>` virtual tables current, and the
 * dashboard `dashcards` / `dashcardData` slices drop stale data for the updated
 * card. The payload mirrors the former `Questions` entity action shape
 * (`object` / `question`) so the reducers that consumed those actions keep
 * working unchanged.
 *
 * Annotated as `string` (not the inferred string literal) on purpose: reducers
 * pass these to `builder.addCase(type, reducer)`, and a literal type makes
 * TypeScript resolve the createReducer overloads deeply enough to trip the
 * instantiation-depth limit on the large dashboard reducer chains. (The former
 * entity action types sidestepped this by being typed `any`.)
 */
export const CARD_CREATED: string = "metabase/cards/CREATED";
export const CARD_UPDATED: string = "metabase/cards/UPDATED";

export const cardCreated = (card: Card) => ({
  type: CARD_CREATED,
  payload: { object: card, question: card },
});

export const cardUpdated = (card: Card) => ({
  type: CARD_UPDATED,
  payload: { object: card, question: card },
});

/**
 * Creates a card and notifies the retired-entity reducers. Replaces
 * `Questions.actions.create`, preserving its request shaping: only writable
 * properties are sent, and the card is filed into either a dashboard or a
 * collection.
 */
export const createQuestionCard =
  (request: CreateCardRequest) =>
  async (dispatch: Dispatch): Promise<Card> => {
    const { collection_id, dashboard_id, dashboard_tab_id, ...rest } = request;

    const destination = dashboard_id
      ? { dashboard_id, dashboard_tab_id }
      : { collection_id };

    const card: Card = await runRtkEndpoint(
      { ...rest, ...destination },
      dispatch,
      cardApi.endpoints.createCard,
    );
    dispatch(cardCreated(card));
    return card;
  };

/**
 * Updates a card and notifies the retired-entity reducers. Replaces
 * `Questions.actions.update`, sending only writable properties.
 */
export const updateQuestionCard =
  (request: UpdateCardRequest) =>
  async (dispatch: Dispatch): Promise<Card> => {
    const card: Card = await runRtkEndpoint(
      request,
      dispatch,
      cardApi.endpoints.updateCard,
    );
    dispatch(cardUpdated(card));
    return card;
  };
