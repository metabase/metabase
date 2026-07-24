import type {
  AddConnectorStreamsRequest,
  ConnectorOauthStatusResponse,
  ConnectorOauthUrlResponse,
  CreateConnectorConnectionRequest,
  IngestionConnector,
  TestPythonTransformRequest,
  TestPythonTransformResponse,
  Transform,
  UpdateConnectorConnectionRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, listTag } from "./tags";

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
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("transform")]),
    }),
    updateConnectorConnection: builder.mutation<
      Transform[],
      UpdateConnectorConnectionRequest
    >({
      query: ({ transformId, ...body }) => ({
        url: `/api/ee/transforms-python/connector/connection/${transformId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("transform")]),
    }),
    addConnectorStreams: builder.mutation<
      Transform[],
      AddConnectorStreamsRequest
    >({
      query: ({ transformId, streams }) => ({
        url: `/api/ee/transforms-python/connector/connection/${transformId}/streams`,
        method: "POST",
        body: { streams },
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("transform")]),
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
  useUpdateConnectorConnectionMutation,
  useAddConnectorStreamsMutation,
} = pythonRunnerApi;
