import { EnterpriseApi } from "metabase-enterprise/api";

import type {
  DdlExecutionStatus,
  DropIndexResult,
  Proposal,
  TargetIndex,
} from "../types";

export { runOptimizerStream } from "./stream";

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
 * One entry in the accept response's `ddl_statements`. Mirrors the BE
 * shape: every accepted source-DB statement carries an execution
 * `status`; every accepted transform-target / precompute-of statement
 * carries `status: "pending"` (it's queued on the new transform's
 * `target.post_run_ddl` and will run after the next transform run);
 * rejected statements pass through with no status but a `rejection`.
 */
export type AcceptDdlStatement = {
  id: string;
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

export type AcceptResponse = {
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
};

export type ListIndexesResponse = {
  transform: { id: number; target: unknown };
  indexes: TargetIndex[];
};

const optimizerApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
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
        collectionId?: number;
      }
    >({
      query: ({ transformId, proposalIds, collectionId }) => ({
        method: "POST",
        url: `/api/ee/transform-optimizer/${transformId}/proposal/accept`,
        body: {
          proposal_ids: proposalIds,
          ...(collectionId != null ? { collection_id: collectionId } : {}),
        },
      }),
    }),
    listTargetIndexes: builder.query<
      ListIndexesResponse,
      { transformId: number | string }
    >({
      query: ({ transformId }) => ({
        method: "GET",
        url: `/api/ee/transform-optimizer/${transformId}/indexes`,
      }),
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
    }),
  }),
});

export const {
  useVerifyProposalMutation,
  useAcceptProposalMutation,
  useListTargetIndexesQuery,
  useDropTargetIndexMutation,
} = optimizerApi;
