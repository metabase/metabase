import type { ApplyAdvancedConfigRequest } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, listTag, tag } from "./tags";

export const advancedConfigApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    applyAdvancedConfig: builder.mutation<void, ApplyAdvancedConfigRequest>({
      query: ({ config }) => {
        const formData = new FormData();
        formData.append("config", config);
        return {
          method: "POST",
          url: "/api/ee/advanced-config",
          body: formData,
        };
      },
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          tag("workspace"),
          listTag("workspace"),
          listTag("database"),
        ]),
    }),
  }),
});

export const { useApplyAdvancedConfigMutation } = advancedConfigApi;
