import { EnterpriseApi } from "./api";

export const slackbotApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getSlackbotManifest: builder.query<Record<string, unknown>, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/metabot-v3/slack/manifest",
      }),
    }),
  }),
});

export const { useGetSlackbotManifestQuery } = slackbotApi;
