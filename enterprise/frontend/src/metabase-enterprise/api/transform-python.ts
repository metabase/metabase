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
      transformResponse: (response: any) => {
        // Extract the nested result from the backend response
        if (response?.result?.body) {
          return {
            output: response.result.body.output,
            stdout: response.result.body.stdout,
            stderr: response.result.body.stderr,
            error: response.result.body.error,
            exit_code: response.result.body.exit_code,
            timeout: response.result.body.timeout,
          };
        }
        return response;
      },
      transformErrorResponse: (response: any) => {
        return {
          status: response?.status || 500,
          data: {
            error: response?.data?.error || "Python execution failed",
            stdout: response?.data?.stdout || "",
            stderr: response?.data?.stderr || "",
            exit_code: response?.data?.exit_code,
          },
        };
      },
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
