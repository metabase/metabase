import { createApi } from "@reduxjs/toolkit/query/react";

import type {
  ApiKey,
  CreateApiKeyInput,
  CreateApiKeyResponse,
  UpdateApiKeyInput,
  UpdateApiKeyOutput,
  RegenerateApiKeyResponse,
} from "metabase-types/api/admin";

import { createEntityApi, getListTag } from "metabase/redux/utils";

export const ApiKeysApi = createEntityApi<
  ApiKey,
  "ApiKey",
  CreateApiKeyInput,
  CreateApiKeyResponse,
  UpdateApiKeyInput,
  UpdateApiKeyOutput
>({
  entityName: "ApiKey",
  apiPath: "api-key",
}).injectEndpoints({
  endpoints: builder => ({
    count: builder.query<number, void>({
      query: () => `/api/api-key/count`,
    }),
    regenerate: builder.mutation<RegenerateApiKeyResponse, ApiKey["id"]>({
      query: id => ({ method: "PUT", url: `/api/api-key/${id}/regenerate` }),
      invalidatesTags: [getListTag("ApiKey")],
    }),
  }),
});
