import { Api } from "metabase/api";

import { listTag } from "./tags";

type CheckListApiStep =
  | "create-dashboard"
  | "add-data"
  | "create-models"
  | "configure-row-column-security"
  | "create-test-embed"
  | "embed-production"
  | "secure-embeds"
  | "enable-tenants"
  | "create-tenants"
  | "setup-data-segregation-strategy"
  | "data-permissions-and-enable-tenants";
export type EmbeddingHubChecklist = Record<CheckListApiStep, boolean>;

export const embeddingHubApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getEmbeddingHubChecklist: builder.query<EmbeddingHubChecklist, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/embedding-hub/checklist",
      }),
      providesTags: [listTag("embedding-hub-checklist")],
    }),
  }),
});

export const { useGetEmbeddingHubChecklistQuery } = embeddingHubApi;
