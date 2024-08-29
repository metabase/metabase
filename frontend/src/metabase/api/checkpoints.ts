import { provideCheckpointsTags } from "./tags";
import { Api } from "./api";

// Update the API configuration
export const checkpointsApi = Api.injectEndpoints({
  endpoints: builder => ({
    listCheckpoints: builder.query<any, void>({
      // Specify `void` to indicate no arguments
      query: () => ({
        method: "GET",
        url: `/api/checkpoints`,
      }),
      providesTags: (checkpoints = []) => provideCheckpointsTags(checkpoints),
    }),
    getCheckpoint: builder.query<any, number | string>({
      // ID can be number or string
      query: id => ({
        method: "GET",
        url: `/api/checkpoints/${id}`,
      }),
      providesTags: checkpoint =>
        checkpoint ? [{ type: "checkpoints", id: checkpoint.id }] : [],
    }),
  }),
});

// Export the auto-generated hooks for the endpoints
export const { useListCheckpointsQuery, useGetCheckpointQuery } =
  checkpointsApi;
