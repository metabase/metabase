import { EnterpriseApi } from "metabase-enterprise/api";

import type { Proposal } from "../types";

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

export type AcceptResponse = {
  created_transforms: Array<{
    id: number;
    name: string;
    proposal_id: string;
    kind: string;
    depends_on: string[];
  }>;
  advisory_ddl: Array<{
    id: string;
    proposal_id: string;
    statement: string;
    target: unknown;
    rationale: string;
    validation: "accepted" | "rejected";
    index_name?: string | null;
  }>;
  skipped_proposals: string[];
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
  }),
});

export const { useVerifyProposalMutation, useAcceptProposalMutation } =
  optimizerApi;
