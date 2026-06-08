import { Api } from "metabase/api/api";

type EntityParams = {
  entityType: "card" | "dashboard";
  entityId: number;
};

type PasswordResponse = {
  password: string;
};

function entityUrl({ entityType, entityId }: EntityParams) {
  return entityType === "card"
    ? `/api/card/${entityId}/public_password`
    : `/api/dashboard/${entityId}/public_password`;
}

export const publicLinkPasswordsApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getPublicLinkPassword: builder.query<PasswordResponse, EntityParams>({
      query: (params) => ({
        method: "GET",
        url: entityUrl(params),
      }),
      providesTags: (_result, _error, params) => [
        {
          type: "public-link-password",
          id: `${params.entityType}-${params.entityId}`,
        },
      ],
    }),

    setPublicLinkPassword: builder.mutation<
      void,
      EntityParams & { password: string }
    >({
      query: ({ password, ...params }) => ({
        method: "PUT",
        url: entityUrl(params),
        body: { password },
      }),
      invalidatesTags: (_result, _error, params) => [
        {
          type: "public-link-password",
          id: `${params.entityType}-${params.entityId}`,
        },
      ],
    }),

    deletePublicLinkPassword: builder.mutation<void, EntityParams>({
      query: (params) => ({
        method: "DELETE",
        url: entityUrl(params),
      }),
      invalidatesTags: (_result, _error, params) => [
        {
          type: "public-link-password",
          id: `${params.entityType}-${params.entityId}`,
        },
      ],
    }),
  }),
});

export const {
  useGetPublicLinkPasswordQuery,
  useSetPublicLinkPasswordMutation,
  useDeletePublicLinkPasswordMutation,
} = publicLinkPasswordsApi;
