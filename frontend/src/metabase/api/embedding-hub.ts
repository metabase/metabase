import { Api } from "metabase/api";
import type { DataSegregationStrategy } from "metabase/embedding/embedding-hub";

import { listTag } from "./tags";

type CheckListApiStep =
  | "create-dashboard"
  | "add-data"
  | "configure-row-column-security"
  | "create-test-embed"
  | "embed-production"
  | "sso-configured"
  | "enable-tenants"
  | "create-tenants"
  | "setup-data-segregation-strategy"
  | "data-permissions-and-enable-tenants"
  | "sso-auth-manual-tested";
export type EmbeddingHubChecklist = Record<CheckListApiStep, boolean>;

export type EmbeddingHubChecklistResponse = {
  checklist: EmbeddingHubChecklist;
  "data-isolation-strategy": DataSegregationStrategy | null;
};

export const embeddingHubApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getEmbeddingHubChecklist: builder.query<
      EmbeddingHubChecklistResponse,
      void
    >({
      query: () => ({
        method: "GET",
        url: "/api/ee/embedding-hub/checklist",
      }),
      providesTags: [listTag("embedding-hub-checklist")],
    }),
  }),
});

export const { useGetEmbeddingHubChecklistQuery } = embeddingHubApi;
