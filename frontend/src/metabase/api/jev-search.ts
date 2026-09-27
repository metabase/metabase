import type {
  SearchModel,
  SearchResponse,
  SearchResult,
  SearchResultId,
} from "metabase-types/api";

import { Api } from "./api";

export interface JevRerankCandidate {
  model: SearchModel;
  id: SearchResultId;
  name: string;
  description?: string | null;
  collection_name?: string | null;
}

export type JevRerankStatus = "ok" | "unavailable" | "too-few" | "empty-query";

export interface JevRankedItem {
  model: SearchModel;
  id: SearchResultId;
  /** Relevance on Jev's 0..3 rubric (probability-weighted), null when Jev didn't score it. */
  score: number | null;
}

export interface JevBestMatch {
  model: SearchModel;
  id: SearchResultId;
  confidence: number;
}

export interface JevSearchRerankResponse {
  status: JevRerankStatus;
  elapsed_ms: number;
  usage: { input_tokens: number; output_tokens: number } | null;
  ranked: JevRankedItem[];
  best: JevBestMatch | null;
}

export interface JevSearchRerankRequest {
  q: string;
  /** Keyword results the palette already has, in keyword order. */
  keywordResults: SearchResult[];
  /** Extra search terms used to widen the candidate pool beyond the literal keyword match. */
  recallTerms: string[];
}

export interface JevSearchRerankResult {
  /** Every candidate that was sent to Jev: keyword results first, then recall-only extras. */
  pool: SearchResult[];
  keywordCount: number;
  response: JevSearchRerankResponse;
}

const MAX_CANDIDATES = 25;
const RECALL_LIMIT_PER_TERM = 8;
const POPULAR_LIMIT = 25;
const POPULAR_MODELS: SearchModel[] = [
  "metric",
  "dataset",
  "card",
  "dashboard",
];

const resultKey = ({ model, id }: { model: string; id: SearchResultId }) =>
  `${model}:${id}`;

export const buildCandidatePool = (
  keywordResults: SearchResult[],
  recallResults: SearchResult[][],
): SearchResult[] => {
  const seen = new Set<string>();
  const pool: SearchResult[] = [];
  for (const result of [keywordResults, ...recallResults].flat()) {
    const key = resultKey(result);
    if (!seen.has(key) && pool.length < MAX_CANDIDATES) {
      seen.add(key);
      pool.push(result);
    }
  }
  return pool;
};

const toCandidate = (result: SearchResult): JevRerankCandidate => ({
  model: result.model,
  id: result.id,
  name: result.name,
  description: result.description,
  collection_name: result.collection?.name ?? null,
});

/**
 * Jev-reranked palette search. Keyword search (appdb) needs every word to match, so a natural-language
 * request often finds little; we widen recall with a few per-term searches plus popular content (all
 * through the permission-checked `/api/search`), then Jev reorders that closed set. It never adds items
 * the user couldn't already find.
 */
export const jevSearchApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    jevSearchRerank: builder.query<
      JevSearchRerankResult,
      JevSearchRerankRequest
    >({
      async queryFn(
        { q, keywordResults, recallTerms },
        _api,
        _extra,
        fetchWithBQ,
      ) {
        const searches = await Promise.all([
          ...recallTerms.map((term) =>
            fetchWithBQ({
              method: "GET",
              url: "/api/search",
              params: {
                q: term,
                context: "command-palette",
                include_dashboard_questions: true,
                limit: RECALL_LIMIT_PER_TERM,
              },
            }),
          ),
          fetchWithBQ({
            method: "GET",
            url: "/api/search",
            params: {
              context: "command-palette",
              models: POPULAR_MODELS,
              limit: POPULAR_LIMIT,
            },
          }),
        ]);
        const recallResults = searches.map(
          // /api/search always answers with a SearchResponse; a failed recall search just adds nothing
          (search) => (search.data as SearchResponse | undefined)?.data ?? [],
        );
        const pool = buildCandidatePool(keywordResults, recallResults);

        const rerank = await fetchWithBQ({
          method: "POST",
          url: "/api/jev/search/rerank",
          body: { q, candidates: pool.map(toCandidate) },
        });
        if (rerank.error) {
          return { error: rerank.error };
        }
        return {
          data: {
            pool,
            keywordCount: keywordResults.length,
            // the endpoint's response shape is declared by JevSearchRerankResponse (metabase.jev.apps.search)
            response: rerank.data as JevSearchRerankResponse,
          },
        };
      },
    }),
  }),
});

export const { useJevSearchRerankQuery } = jevSearchApi;
