import { Api } from "metabase/api";

interface ExecutePythonRequest {
  code: string;
  tables: Record<string, number>;
}

interface ExecutePythonResponse {
  output?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
  exit_code?: number;
  timeout?: boolean;
}

export const pythonRunnerApi = Api.injectEndpoints({
  endpoints: builder => ({
    executePython: builder.mutation<ExecutePythonResponse, ExecutePythonRequest>({
      queryFn: async ({ code, tables }, { getState }) => {
        try {
          // Get settings from Redux state
          const state = getState() as any;
          const settings = state.settings?.values || {};

          const serverUrl = settings["python-runner-base-url"] || "http://localhost:3000";
          const apiKey = settings["python-runner-api-key"] || "";

          const response = await fetch(`${serverUrl}/api/python-runner/execute`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json"
            },
            body: JSON.stringify({
              code,
              tables
            })
          });

          const result = await response.json();

          if (response.ok) {
            return { data: result };
          } else {
            return { error: { status: response.status, data: result } };
          }
        } catch (error: any) {
          return {
            error: {
              status: 500,
              data: {
                error: `Failed to connect to Python execution server: ${error.message}`,
                stdout: "",
                stderr: ""
              }
            }
          };
        }
      }
    }),
  }),
  overrideExisting: true,
});

export const { useExecutePythonMutation } = pythonRunnerApi;
