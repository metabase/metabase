import type { EnterpriseSettings } from "metabase-types/api";

import { Api } from "./api";

type SlackSettings = Pick<
  EnterpriseSettings,
  "slack-app-token" | "slack-bug-report-channel"
>;

export const slackApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getSlackManifest: builder.query<string, void>({
      query: (params) => ({
        method: "GET",
        url: "/api/slack/manifest",
        params,
      }),
    }),
    updateSlackSettings: builder.mutation<void, Partial<SlackSettings>>({
      query: (settings) => ({
        method: "PUT",
        url: `/api/slack/settings`,
        body: settings,
      }),
      invalidatesTags: ["session-properties"],
    }),
    // TODO: this is EE, move this elsewhere
    getSlackbotManifest: builder.query<Record<string, unknown>, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/metabot-v3/slack/manifest",
      }),
    }),
  }),
});

export const {
  useGetSlackManifestQuery,
  useUpdateSlackSettingsMutation,
  useGetSlackbotManifestQuery,
} = slackApi;
