import { Api } from "metabase/api";

type CheckListApiStep =
  | "create-dashboard"
  | "add-data"
  | "configure-row-column-security"
  | "create-test-embed"
  | "embed-production"
  | "secure-embeds";
export type EmbeddingHubChecklist = Record<CheckListApiStep, boolean>;

export const embeddingHubApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getEmbeddingHubChecklist: builder.query<EmbeddingHubChecklist, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/embedding-hub/checklist",
      }),
    }),
  }),
});

export const { useGetEmbeddingHubChecklistQuery } = embeddingHubApi;
