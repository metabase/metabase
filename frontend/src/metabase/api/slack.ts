import type { EnterpriseSettings } from "metabase-types/api";

import { Api } from "./api";

type SlackSettings = Pick<
  EnterpriseSettings,
  "slack-app-token" | "slack-bug-report-channel"
>;

export const slackApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getSlackManifest: builder.query<Record<string, unknown>, void>({
      query: () => ({
        method: "GET",
        url: "/api/slack/manifest",
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
