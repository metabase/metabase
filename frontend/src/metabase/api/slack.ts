import type { EnterpriseSettings } from "metabase-types/api";

import { Api } from "./api";

type SlackSettings = Pick<
  EnterpriseSettings,
  "slack-app-token" | "slack-bug-report-channel" | "slack-token"
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
  }),
});

export const { useGetSlackManifestQuery, useUpdateSlackSettingsMutation } =
  slackApi;
