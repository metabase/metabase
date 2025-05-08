import _ from "underscore";

import type {
  EnterpriseSettingKey,
  EnterpriseSettingValue,
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
    getSetting: builder.query<EnterpriseSettingValue, EnterpriseSettingKey>({
      query: (name) => ({
        method: "GET",
        url: `/api/setting/${encodeURIComponent(name)}`,
      }),
      providesTags: ["session-properties"],
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
    updateSettings: builder.mutation<
      void,
      Record<EnterpriseSettingKey, EnterpriseSettingValue>
    >({
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
  useGetAdminSettingsDetailsQuery,
  useUpdateSettingMutation,
  useUpdateSettingsMutation,
} = settingsApi;
