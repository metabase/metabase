import { createReducer } from "@reduxjs/toolkit";

import {
  updateCardEmbeddingParams,
  updateCardEnableEmbedding,
} from "metabase/api";
import type { Card, DatasetQuery } from "metabase-types/api";

import {
  API_CREATE_QUESTION,
  API_UPDATE_QUESTION,
  CANCEL_QUESTION_CHANGES,
  CREATE_PUBLIC_LINK,
  DELETE_PUBLIC_LINK,
  INITIALIZE_QB,
  QUERY_COMPLETED,
  RELOAD_CARD,
  RESET_QB,
  SET_CARD_AND_RUN,
  SOFT_RELOAD_CARD,
  UPDATE_QUESTION,
} from "./actions";

// the card that is actively being worked on
export const card = createReducer<Card<DatasetQuery> | null>(null, builder => {
  builder
    .addCase(RESET_QB, () => null)
    .addCase<
      string,
      {
        type: string;
        payload: {
          card: Card;
        };
      }
    >(INITIALIZE_QB, (state, action) =>
      action.payload ? action.payload.card : null,
    )
    .addCase<
      string,
      {
        type: string;
        payload: Card;
      }
    >(SOFT_RELOAD_CARD, (state, action) => action.payload)
    .addCase<
      string,
      {
        type: string;
        payload: Card;
      }
    >(RELOAD_CARD, (state, action) => action.payload)
    .addCase<
      string,
      {
        type: string;
        payload: {
          card: Card;
        };
      }
    >(SET_CARD_AND_RUN, (state, action) => action.payload.card)
    .addCase<
      string,
      {
        type: string;
        payload: Card;
      }
    >(API_CREATE_QUESTION, (state, action) => action.payload)
    .addCase<
      string,
      {
        type: string;
        payload: Card;
      }
    >(API_UPDATE_QUESTION, (state, action) => action.payload)
    .addCase<
      string,
      {
        type: string;
        payload: {
          card: Card;
        };
      }
    >(CANCEL_QUESTION_CHANGES, (state, action) => action.payload.card)
    .addCase<
      string,
      {
        type: string;
        payload: {
          card: Card;
        };
      }
    >(UPDATE_QUESTION, (state, action) => action.payload.card)
    .addCase<
      string,
      {
        type: string;
        payload: {
          card: Card;
        };
      }
    >(QUERY_COMPLETED, (state, action) => {
      if (!state) {
        return state;
      }
      return {
        ...state,
        display: action.payload.card.display,
        result_metadata: action.payload.card.result_metadata,
        visualization_settings: action.payload.card.visualization_settings,
      };
    })
    .addCase<
      string,
      {
        type: string;
        payload: {
          uuid: Card["public_uuid"];
        };
      }
    >(CREATE_PUBLIC_LINK, (state, action) => {
      if (!state) {
        return state;
      }
      return {
        ...state,
        public_uuid: action.payload.uuid,
      };
    })
    .addCase<
      string,
      {
        type: string;
      }
    >(DELETE_PUBLIC_LINK, state => {
      if (!state) {
        return state;
      }

      return {
        ...state,
        public_uuid: null,
      };
    })
    .addMatcher(updateCardEnableEmbedding.matchFulfilled, (state, action) => {
      if (!state) {
        return state;
      }
      return {
        ...state,
        enable_embedding: action.payload.enable_embedding,
      };
    })
    .addMatcher(updateCardEmbeddingParams.matchFulfilled, (state, action) => {
      if (!state) {
        return state;
      }
      return {
        ...state,
        embedding_params: action.payload.embedding_params,
        initially_published_at: action.payload.initially_published_at,
      };
    });
});
