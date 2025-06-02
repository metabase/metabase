import _ from "underscore";

import type {
  EnterpriseSettingKey,
  EnterpriseSettingValue,
  EnterpriseSettings,
  SettingDefinition,
  SettingDefinitionMap,
} from "metabase-types/api";

import { Api } from "./api";
import { invalidateTags, tag } from "./tags";

export const settingsApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    // admin-only endpoint that returns all settings with lots of extra metadata
    getAdminSettingsDetails: builder.query<SettingDefinitionMap, void>({
      query: () => ({
        method: "GET",
        url: "/api/setting",
      }),
      transformResponse: (response: SettingDefinition[]) =>
        _.indexBy(response, "key") as SettingDefinitionMap,
    }),
    getSetting: builder.query<
      EnterpriseSettingValue,
      Exclude<EnterpriseSettingKey, "version-info">
    >({
      query: (name) => ({
        method: "GET",
        url: `/api/setting/${encodeURIComponent(name)}`,
      }),
      providesTags: ["session-properties"],
    }),
    getVersionInfo: builder.query<EnterpriseSettings["version-info"], void>({
      query: () => ({
        method: "GET",
        url: "/api/setting/version-info",
      }),
      // don't provide a tag, this should never be refetched
    }),
    updateSetting: builder.mutation<
      void,
      {
        key: EnterpriseSettingKey;
        value: EnterpriseSettingValue<EnterpriseSettingKey>;
      }
    >({
      query: ({ key, value }) => ({
        method: "PUT",
        url: `/api/setting/${encodeURIComponent(key)}`,
        body: { value },
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
    updateSettings: builder.mutation<void, Partial<EnterpriseSettings>>({
      query: (settings) => ({
        method: "PUT",
        url: `/api/setting`,
        body: settings,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
  }),
});

export const {
  useGetSettingQuery,
  useGetVersionInfoQuery,
  useGetAdminSettingsDetailsQuery,
  useUpdateSettingMutation,
  useUpdateSettingsMutation,
} = settingsApi;
