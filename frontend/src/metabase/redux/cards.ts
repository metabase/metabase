import _ from "underscore";

import { cardApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import type { Dispatch } from "metabase/redux/store";
import type { Card } from "metabase-types/api";

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

// The card endpoints reject unknown keys, so these lists must not drift.
// NOTE: keep in sync with src/metabase/queries_rest/api/card.clj
const WRITABLE_CARD_PROPERTIES = [
  "name",
  "cache_ttl",
  "type",
  "dataset_query",
  "display",
  "description",
  "visualization_settings",
  "parameters",
  "parameter_mappings",
  "collection_id",
  "dashboard_id",
  "dashboard_tab_id",
  "collection_position",
  "result_metadata",
] as const;

const CREATABLE_CARD_PROPERTIES = [
  ...WRITABLE_CARD_PROPERTIES,
  "size",
] as const;

const UPDATABLE_CARD_PROPERTIES = [
  ...WRITABLE_CARD_PROPERTIES,
  "archived",
  "enable_embedding",
  "embedding_params",
  "collection_preview",
  "delete_old_dashcards",
] as const;

const pick = (card: object, properties: readonly string[]) =>
  // Unjustified type cast. FIXME
  _.pick(card, "id", ...properties) as Record<string, unknown>;

/**
 * Creates a card and notifies the retired-entity reducers. Replaces
 * `Questions.actions.create`, preserving its request shaping: only writable
 * properties are sent, and the card is filed into either a dashboard or a
 * collection.
 */
export const createQuestionCard =
  (request: object) =>
  async (dispatch: Dispatch): Promise<Card> => {
    const { collection_id, dashboard_id, dashboard_tab_id, ...rest } = pick(
      request,
      CREATABLE_CARD_PROPERTIES,
    );

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
  (request: object) =>
  async (dispatch: Dispatch): Promise<Card> => {
    const card: Card = await runRtkEndpoint(
      pick(request, UPDATABLE_CARD_PROPERTIES),
      dispatch,
      cardApi.endpoints.updateCard,
    );
    dispatch(cardUpdated(card));
    return card;
  };
