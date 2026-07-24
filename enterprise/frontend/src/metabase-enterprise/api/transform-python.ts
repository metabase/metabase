import type {
  ConnectorOauthStatusResponse,
  ConnectorOauthUrlResponse,
  CreateConnectorConnectionRequest,
  IngestionConnector,
  TestPythonTransformRequest,
  TestPythonTransformResponse,
  Transform,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const pythonRunnerApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    executePython: builder.mutation<
      TestPythonTransformResponse,
      TestPythonTransformRequest
    >({
      query: ({ code, source_tables }) => ({
        url: "/api/ee/transforms-python/test-run",
        method: "POST",
        body: {
          code,
          source_tables,
        },
      }),
    }),
    listIngestionConnectors: builder.query<IngestionConnector[], void>({
      query: () => ({
        url: "/api/ee/transforms-python/connector",
        method: "GET",
      }),
    }),
    getConnectorOauthUrl: builder.query<ConnectorOauthUrlResponse, string>({
      query: (connectorId) => ({
        url: `/api/ee/transforms-python/connector/${connectorId}/oauth/url`,
        method: "GET",
      }),
    }),
    getConnectorOauthStatus: builder.query<
      ConnectorOauthStatusResponse,
      string
    >({
      query: (state) => ({
        url: "/api/ee/transforms-python/connector/oauth/status",
        method: "GET",
        params: { state },
      }),
    }),
    createConnectorConnection: builder.mutation<
      Transform[],
      CreateConnectorConnectionRequest
    >({
      query: ({ connectorId, ...body }) => ({
        url: `/api/ee/transforms-python/connector/${connectorId}/connection`,
        method: "POST",
        body,
      }),
    }),
  }),
  overrideExisting: true,
});

export const {
  useExecutePythonMutation,
  useListIngestionConnectorsQuery,
  useLazyGetConnectorOauthUrlQuery,
  useLazyGetConnectorOauthStatusQuery,
  useCreateConnectorConnectionMutation,
} = pythonRunnerApi;
