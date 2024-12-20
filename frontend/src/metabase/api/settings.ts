import type { SettingKey, SettingValue } from "metabase-types/api";

import { Api } from "./api";

export const settingApi = Api.injectEndpoints({
  endpoints: builder => ({
    getSetting: builder.query<SettingValue, SettingKey>({
      query: settingName => ({
        method: "GET",
        url: `/api/setting/${settingName}`,
      }),
    }),
  }),
});

export const { useGetSettingQuery } = settingApi;
