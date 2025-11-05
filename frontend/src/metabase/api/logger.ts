import type { AdjustLogLevelsRequest, LoggerPreset } from "metabase-types/api";

import { Api } from "./api";
import { provideLoggerPresetListTags } from "./tags";

export const loggerApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listLoggerPresets: builder.query<LoggerPreset[], void>({
      query: () => "/api/logger/presets",
      providesTags: (response) =>
        response ? provideLoggerPresetListTags(response) : [],
    }),
    adjustLogLevels: builder.mutation<void, AdjustLogLevelsRequest>({
      query: (body) => ({
        url: "/api/logger/adjustment",
        method: "POST",
        body,
      }),
    }),
    resetLogLevels: builder.mutation<void, void>({
      query: () => ({
        url: "/api/logger/adjustment",
        method: "DELETE",
      }),
    }),
  }),
});

export const {
  useListLoggerPresetsQuery,
  useAdjustLogLevelsMutation,
  useResetLogLevelsMutation,
} = loggerApi;
