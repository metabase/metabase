import type { EnterpriseSettings } from "metabase-types/api";

import { Api } from "./api";

type SlackSettings = Pick<
  EnterpriseSettings,
  "slack-app-token" | "slack-bug-report-channel"
>;

interface SlackAppInfo {
  app_id: string | null;
  team_id: string | null;
  scopes: {
    actual: string[];
    required: string[];
    missing: string[];
    extra: string[];
  } | null;
}

export const slackApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getSlackManifest: builder.query<Record<string, unknown>, void>({
      query: () => ({
        method: "GET",
        url: "/api/slack/manifest",
      }),
    }),
    getSlackAppInfo: builder.query<SlackAppInfo, void>({
      query: () => ({
        method: "GET",
        url: "/api/slack/app-info",
      }),
      providesTags: ["slack-app-info"],
    }),
    updateSlackSettings: builder.mutation<void, Partial<SlackSettings>>({
      query: (settings) => ({
        method: "PUT",
        url: `/api/slack/settings`,
        body: settings,
      }),
      invalidatesTags: ["session-properties", "slack-app-info"],
    }),
  }),
});

export const {
  useGetSlackManifestQuery,
  useGetSlackAppInfoQuery,
  useUpdateSlackSettingsMutation,
} = slackApi;
