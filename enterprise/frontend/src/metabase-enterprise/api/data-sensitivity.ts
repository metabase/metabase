import type {
  ClassifyDataSensitivityDatabaseRequest,
  ConcreteTableId,
  DataSensitivityDatabaseResult,
  DataSensitivityTableResult,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

// Both endpoints are dry runs that write nothing, so there are no cache tags to invalidate.
export const dataSensitivityApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    classifyDataSensitivityTable: builder.mutation<
      DataSensitivityTableResult,
      ConcreteTableId
    >({
      query: (tableId) => ({
        method: "POST",
        url: `/api/ee/data-sensitivity/table/${tableId}`,
      }),
    }),
    classifyDataSensitivityDatabase: builder.mutation<
      DataSensitivityDatabaseResult,
      ClassifyDataSensitivityDatabaseRequest
    >({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `/api/ee/data-sensitivity/database/${id}`,
        body,
      }),
    }),
  }),
});

export const {
  useClassifyDataSensitivityTableMutation,
  useClassifyDataSensitivityDatabaseMutation,
} = dataSensitivityApi;
