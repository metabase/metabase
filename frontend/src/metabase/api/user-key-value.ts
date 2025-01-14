import type {
  DeleteUserKeyValueRequest,
  GetUserKeyValueRequest,
  UpdateUserKeyValueRequest,
} from "metabase-types/api";

import { Api } from "./api";

export const userKeyValueApi = Api.injectEndpoints({
  endpoints: builder => ({
    getUserKeyValue: builder.query<any, GetUserKeyValueRequest>({
      query: ({ namespace, key }) =>
        `/api/user-key-value/namespace/${namespace}/key/${key}`,
    }),
    updateKeyValue: builder.mutation<any, UpdateUserKeyValueRequest>({
      query: ({ namespace, key, ...body }) => ({
        method: "PUT",
        url: `/api/user-key-value/namespace/${namespace}/key/${key}`,
        body,
      }),
      async onQueryStarted(
        { key, namespace, value },
        { dispatch, queryFulfilled },
      ) {
        const kvResult = dispatch(
          userKeyValueApi.util.updateQueryData(
            "getUserKeyValue",
            { key, namespace },
            () => value,
          ),
        );
        queryFulfilled.catch(err => {
          console.error("Unable to update user key value", err);
          kvResult.undo();
        });
      },
    }),
    deleteUserKeyValue: builder.mutation<unknown, DeleteUserKeyValueRequest>({
      query: ({ namespace, key, ...body }) => ({
        method: "DELETE",
        url: `/api/user-key-value/namespace/${namespace}/key/${key}`,
        body,
      }),
      async onQueryStarted({ key, namespace }, { dispatch, queryFulfilled }) {
        const kvResult = dispatch(
          userKeyValueApi.util.updateQueryData(
            "getUserKeyValue",
            { key, namespace },
            () => undefined,
          ),
        );
        queryFulfilled.catch(err => {
          console.error("Unable to update user key value", err);
          kvResult.undo();
        });
      },
    }),
  }),
});

export const {
  useGetUserKeyValueQuery,
  useUpdateKeyValueMutation,
  useDeleteUserKeyValueMutation,
} = userKeyValueApi;
