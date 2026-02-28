import { Api } from "./api";

export const jokeApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getJoke: builder.query<{ setup: string; punchline: string }, void>({
      query: () => ({
        method: "GET",
        url: "/api/joke-of-the-day",
      }),
    }),
  }),
});

export const { useGetJokeQuery } = jokeApi;
