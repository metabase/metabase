import { Api } from "metabase/api/api";

type EntityParams = {
  entityType: "card" | "dashboard";
  entityId: number;
};

type PasswordStatusResponse = {
  has_password: boolean;
};

type RevealPasswordResponse = {
  password: string;
};

function entityUrl({ entityType, entityId }: EntityParams) {
  return entityType === "card"
    ? `/api/card/${entityId}/public_password`
    : `/api/dashboard/${entityId}/public_password`;
}

export const publicLinkPasswordsApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    // Returns whether a password is set, without exposing the secret. Safe to
    // call when the sharing popover opens (not audit-logged).
    getPublicLinkPassword: builder.query<PasswordStatusResponse, EntityParams>({
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

    // Fetches the plaintext secret. This is the audited "reveal" action, so it
    // is only triggered by an explicit user action (reveal/copy/edit), never on
    // mount.
    revealPublicLinkPassword: builder.mutation<
      RevealPasswordResponse,
      EntityParams
    >({
      query: (params) => ({
        method: "POST",
        url: `${entityUrl(params)}/reveal`,
      }),
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
  useRevealPublicLinkPasswordMutation,
  useSetPublicLinkPasswordMutation,
  useDeletePublicLinkPasswordMutation,
} = publicLinkPasswordsApi;
