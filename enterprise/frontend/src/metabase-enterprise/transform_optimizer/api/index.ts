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
    kind: string;
    depends_on: number[];
  }>;
  advisory_ddl: Array<{
    statement: string;
    target: unknown;
    rationale: string;
  }>;
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
        proposal: Proposal;
        collectionId?: number;
      }
    >({
      query: ({ transformId, proposal, collectionId }) => ({
        method: "POST",
        url: `/api/ee/transform-optimizer/${transformId}/proposal/accept`,
        body: {
          proposal_id: proposal.id,
          ...(collectionId != null ? { collection_id: collectionId } : {}),
        },
      }),
    }),
  }),
});

export const { useVerifyProposalMutation, useAcceptProposalMutation } =
  optimizerApi;
