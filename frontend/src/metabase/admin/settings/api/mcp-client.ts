import { Api } from "metabase/api";
import { idTag, invalidateTags, listTag } from "metabase/api/tags";
import type {
  ConnectMcpServerResponse,
  CreateMcpServerRequest,
  ListMcpServerToolsResponse,
  McpServer,
  McpServerId,
  UpdateMcpServerRequest,
} from "metabase-types/api";

export const mcpClientApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listMcpServers: builder.query<McpServer[], void>({
      query: () => `/api/mcp-client/server`,
      providesTags: (servers = []) => [
        listTag("mcp-server"),
        ...servers.map((server) => idTag("mcp-server", server.id)),
      ],
    }),
    createMcpServer: builder.mutation<McpServer, CreateMcpServerRequest>({
      query: (body) => ({
        method: "POST",
        url: `/api/mcp-client/server`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("mcp-server")]),
    }),
    updateMcpServer: builder.mutation<McpServer, UpdateMcpServerRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/mcp-client/server/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("mcp-server"), idTag("mcp-server", id)]),
    }),
    deleteMcpServer: builder.mutation<void, McpServerId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/mcp-client/server/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("mcp-server"), idTag("mcp-server", id)]),
    }),
    connectMcpServer: builder.mutation<ConnectMcpServerResponse, McpServerId>({
      query: (id) => ({
        method: "POST",
        url: `/api/mcp-client/server/${id}/connect`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("mcp-server"), idTag("mcp-server", id)]),
    }),
    disconnectMcpServer: builder.mutation<void, McpServerId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/mcp-client/server/${id}/connection`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("mcp-server"), idTag("mcp-server", id)]),
    }),
    listMcpServerTools: builder.query<ListMcpServerToolsResponse, McpServerId>({
      query: (id) => `/api/mcp-client/server/${id}/tools`,
      providesTags: (_, __, id) => [idTag("mcp-server", id)],
    }),
  }),
});

export const {
  useListMcpServersQuery,
  useCreateMcpServerMutation,
  useUpdateMcpServerMutation,
  useDeleteMcpServerMutation,
  useConnectMcpServerMutation,
  useDisconnectMcpServerMutation,
  useListMcpServerToolsQuery,
} = mcpClientApi;
