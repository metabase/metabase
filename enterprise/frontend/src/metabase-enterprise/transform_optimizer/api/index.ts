import { EnterpriseApi } from "metabase-enterprise/api";
import { idTag, invalidateTags } from "metabase-enterprise/api/tags";

import type {
  DdlExecutionStatus,
  DropIndexResult,
  Proposal,
  TargetIndex,
} from "../types";

export type VerifyResponse =
  | {
      equivalent: boolean;
      slow_duration_ms: number;
      fast_duration_ms: number;
      speedup: number;
      diff_rows: number;
      sample_diff: unknown[] | null;
    }
  | { error: string; detail?: string };

/**
 * The full result of one optimizer run. Returned as a single JSON
 * payload — the optimizer used to be SSE-streamed, but the LLM call is
 * fully buffered server-side anyway, so the streaming framing didn't
 * pay for itself.
 */
export type OptimizeResponse = {
  transform: {
    id: number;
    name: string;
    source_database_id: number;
    target?: unknown;
  };
  sql: string | null;
  summary: string | null;
  proposals: Proposal[];
  optimization_degree: number;
};

/**
 * One entry in the accept response's `ddl_statements`. Each accepted
 * source-DB statement carries an execution `status`; transform-target /
 * precompute-of statements carry `status: "pending"`; rejected
 * statements pass through with no status but a `rejection`.
 */
export type AcceptDdlStatement = {
  proposal_id: string;
  statement: string;
  target: unknown;
  rationale: string;
  validation: "accepted" | "rejected";
  index_name?: string | null;
  rejection?: { reason: string; detail?: string } | null;
  status?: DdlExecutionStatus;
  error_message?: string;
};

/**
 * Accept mode. `"new"` creates fresh transforms for each body-bearing
 * proposal (default). `"replace"` updates the *original* transform's
 * source in place; only valid for a single-proposal accept of
 * kind=rewrite.
 */
export type AcceptMode = "new" | "replace";

export type AcceptResponse =
  | {
      created_transforms: Array<{
        id: number;
        name: string;
        proposal_id: string;
        kind: string;
        depends_on: string[];
        pending_ddl?: number;
      }>;
      ddl_statements: AcceptDdlStatement[];
      skipped_proposals: string[];
    }
  | {
      replaced_transform: {
        id: number;
        name: string;
        proposal_id: string;
        kind: string;
        pending_ddl?: number;
      };
      ddl_statements: AcceptDdlStatement[];
      skipped_proposals: string[];
    };

export type ListIndexesResponse = {
  transform: { id: number; target: unknown };
  indexes: TargetIndex[];
};

const optimizerApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    optimize: builder.query<
      OptimizeResponse,
      { transformId: number | string; analyze?: boolean }
    >({
      query: ({ transformId, analyze = false }) => ({
        method: "POST",
        url: `/api/ee/transform-optimizer/${transformId}/optimize`,
        body: { analyze },
      }),
    }),
    verifyProposal: builder.mutation<
      VerifyResponse,
      { transformId: number | string; proposal: Proposal }
    >({
      query: ({ transformId, proposal }) => ({
        method: "POST",
        url: `/api/ee/transform-optimizer/${transformId}/proposal/verify`,
        body: { proposal_id: proposal.id },
      }),
    }),
    acceptProposal: builder.mutation<
      AcceptResponse,
      {
        transformId: number | string;
        /**
         * Proposal ids in dependency order (roots first). For a single
         * `rewrite` / `index` proposal that's one id; for a `precompute`
         * DAG, every ancestor of the chosen proposal must precede it.
         */
        proposalIds: string[];
        /**
         * `"new"` (default) creates fresh transforms. `"replace"` updates
         * the original transform's source in place — only valid when the
         * batch contains exactly one body-bearing proposal of
         * kind="rewrite".
         */
        mode?: AcceptMode;
        collectionId?: number;
      }
    >({
      query: ({ transformId, proposalIds, mode, collectionId }) => ({
        method: "POST",
        url: `/api/ee/transform-optimizer/${transformId}/proposal/accept`,
        body: {
          proposal_ids: proposalIds,
          ...(mode != null ? { mode } : {}),
          ...(collectionId != null ? { collection_id: collectionId } : {}),
        },
      }),
      // After accept we may have:
      //   - run DDL on one of the transform's referenced tables → refetch the index list
      //   - replaced the original transform's source in place → refetch the
      //     transform detail so the SQL editor / read-only view doesn't show
      //     stale text after the user switches tabs.
      invalidatesTags: (_data, error, { transformId }) =>
        invalidateTags(error, [
          idTag("transform-optimizer-indexes", transformId),
          idTag("transform", transformId),
        ]),
    }),
    listTargetIndexes: builder.query<
      ListIndexesResponse,
      { transformId: number | string }
    >({
      query: ({ transformId }) => ({
        method: "GET",
        url: `/api/ee/transform-optimizer/${transformId}/indexes`,
      }),
      providesTags: (_data, _error, { transformId }) => [
        idTag("transform-optimizer-indexes", transformId),
      ],
    }),
    dropTargetIndex: builder.mutation<
      DropIndexResult,
      { transformId: number | string; indexName: string }
    >({
      query: ({ transformId, indexName }) => ({
        method: "POST",
        url: `/api/ee/transform-optimizer/${transformId}/index/drop`,
        body: { index_name: indexName },
      }),
      invalidatesTags: (_data, error, { transformId }) =>
        invalidateTags(error, [
          idTag("transform-optimizer-indexes", transformId),
        ]),
    }),
  }),
});

export const {
  useLazyOptimizeQuery,
  useVerifyProposalMutation,
  useAcceptProposalMutation,
  useListTargetIndexesQuery,
  useDropTargetIndexMutation,
} = optimizerApi;
