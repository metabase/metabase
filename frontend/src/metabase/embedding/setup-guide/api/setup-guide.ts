import { Api } from "metabase/api";
import { listTag } from "metabase/api/tags";
import type { DataSegregationStrategy } from "metabase-types/api";

type CheckListApiStep =
  | "create-dashboard"
  | "add-data"
  | "configure-row-column-security"
  | "create-test-embed"
  | "embed-production"
  | "sso-configured"
  | "enable-tenants"
  | "move-dashboard-to-shared"
  | "create-tenants"
  | "setup-data-segregation-strategy"
  | "data-permissions-and-enable-tenants"
  | "sso-auth-manual-tested"
  // Embedding hub-only steps. The response is a superset of any one host's step list --
  // the home-page stepper maps its own steps and never looks these up.
  | "create-custom-theme"
  | "configure-ai";
export type SetupGuideChecklist = Record<CheckListApiStep, boolean>;

export type SetupGuideChecklistResponse = {
  checklist: SetupGuideChecklist;
  "data-isolation-strategy": DataSegregationStrategy | null;
};

export const setupGuideApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getSetupGuideChecklist: builder.query<SetupGuideChecklistResponse, void>({
      query: () => ({
        method: "GET",
        // The path keeps the old name: renaming it would break the endpoint.
        url: "/api/embedding-hub/checklist",
      }),
      providesTags: [listTag("setup-guide-checklist")],
    }),
  }),
});

export const { useGetSetupGuideChecklistQuery } = setupGuideApi;
