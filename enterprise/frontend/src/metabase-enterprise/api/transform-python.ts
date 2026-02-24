import type {
  TestPythonTransformRequest,
  TestPythonTransformResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const pythonRunnerApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    executePython: builder.mutation<
      TestPythonTransformResponse,
      TestPythonTransformRequest
    >({
      query: ({ type, code, source_tables }) => ({
        url: "/api/ee/transforms-python/test-run",
        method: "POST",
        body: {
          type,
          code,
          source_tables,
        },
      }),
    }),
  }),
  overrideExisting: true,
});

export const { useExecutePythonMutation } = pythonRunnerApi;
