import { Api } from "./api";

export const utilApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    generateRandomToken: builder.query<{ token: string }, void>({
      query: () => ({
        method: "GET",
        url: "/api/util/random_token",
      }),
    }),
  }),
});

export const { useLazyGenerateRandomTokenQuery } = utilApi;
