import type { CardId, CollectionId, DatasetQuery } from "metabase-types/api";

import { Api } from "./api";
import type { JevUsage } from "./jev";

export interface JevSaveCheckDuplicate {
  card_id: CardId;
  name: string;
  type: "question" | "model" | "metric" | null;
  display: string | null;
  collection_id: CollectionId | null;
  collection_name: string | null;
  confidence: number;
}

export interface JevSaveCheckCollection {
  id: CollectionId;
  name: string;
  confidence: number;
}

export interface JevSaveCheck {
  status: "ok" | "unavailable" | "no-candidates";
  /** An existing card Jev thinks already answers this question, when confident. */
  duplicate: JevSaveCheckDuplicate | null;
  /** The collection Jev thinks this question belongs in, when confident. */
  collection: JevSaveCheckCollection | null;
  summary?: string | null;
  elapsed_ms: number;
  retrieval_ms?: number;
  usage?: JevUsage | null;
}

export interface JevSaveCheckRequest {
  dataset_query: DatasetQuery;
  name?: string;
  description?: string;
  display?: string;
  type?: string;
  /** When saving an edited card as new, don't flag the card it came from. */
  exclude_card_id?: CardId;
}

/**
 * Save-time check for a NEW question (prototype scaffolding, backed by
 * `POST /api/jev/saving/check`, see `metabase.jev.apps.saving`).
 */
export const jevSavingApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    checkNewQuestion: builder.query<JevSaveCheck, JevSaveCheckRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/jev/saving/check",
        body,
      }),
      // A judgment about a draft — no point caching it beyond the modal's life.
      keepUnusedDataFor: 0,
    }),
  }),
});

export const { useCheckNewQuestionQuery } = jevSavingApi;
