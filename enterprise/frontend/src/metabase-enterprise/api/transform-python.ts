import type {
  ExecutePythonTransformRequest,
  ExecutePythonTransformResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const pythonRunnerApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    executePython: builder.mutation<
      ExecutePythonTransformResponse,
      ExecutePythonTransformRequest
    >({
      query: ({ code, tables }) => ({
        url: "/api/ee/transform/test-python",
        method: "POST",
        body: {
          code,
          tables,
        },
      }),
    }),
    cancelPython: builder.mutation<void, void>({
      query: () => ({
        url: "/api/ee/transform/test-python/cancel",
        method: "POST",
      }),
    }),
  }),
  overrideExisting: true,
});

export const { useExecutePythonMutation, useCancelPythonMutation } =
  pythonRunnerApi;
