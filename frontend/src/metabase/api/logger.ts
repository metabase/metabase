import type {
  AdjustLogLevelsRequest,
  AdjustmentPlan,
  LoggerPreset,
} from "metabase-types/api";

import { Api } from "./api";
import { provideLoggerPresetListTags } from "./tags";

export const loggerApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listLoggerPresets: builder.query<LoggerPreset[], void>({
      query: () => "/api/logger/presets",
      providesTags: (response) =>
        response ? provideLoggerPresetListTags(response) : [],
    }),
    adjustLogLevels: builder.mutation<AdjustmentPlan[], AdjustLogLevelsRequest>(
      {
        query: (body) => ({
          url: "/api/logger/adjust",
          method: "POST",
          body,
        }),
      },
    ),
  }),
});

export const { useListLoggerPresetsQuery, useAdjustLogLevelsMutation } =
  loggerApi;
