import { Api } from "./api";

interface CreateSetupRequest {
  token: string;
  user: {
    email: string;
    password: string;
    first_name?: string | null;
    last_name?: string | null;
  };
  prefs: {
    site_name: string;
    site_locale?: string | null;
  };
}

export const setupApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    createSetup: builder.mutation<void, CreateSetupRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/setup",
        body,
      }),
    }),
  }),
});

export const { useCreateSetupMutation } = setupApi;
