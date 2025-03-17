import type {
  SettingDefinition,
  SettingKey,
  SettingValue,
} from "metabase-types/api";

import { Api } from "./api";
import { invalidateTags, tag } from "./tags";

export const settingsApi = Api.injectEndpoints({
  endpoints: builder => ({
    // admin-only endpoint that returns all settings with lots of extra metadata
    getAdminSettingsDetails: builder.query<SettingDefinition[], void>({
      query: () => ({
        method: "GET",
        url: "/api/setting",
      }),
    }),
    getSetting: builder.query<SettingValue, SettingKey>({
      query: name => ({
        method: "GET",
        url: `/api/setting/${name}`,
      }),
      providesTags: ["session-properties"],
    }),
    updateSetting: builder.mutation<
      void,
      {
        key: SettingKey;
        value: SettingValue;
      }
    >({
      query: ({ key, value }) => ({
        method: "PUT",
        url: `/api/setting/${key}`,
        body: { value },
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
    updateSettings: builder.mutation<void, Record<SettingKey, SettingValue>>({
      query: settings => ({
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
