import {
  CreateCubesRequestDetailsRequest,
  CreateCubesRequestDetailsResponse,
  GetCubesRequestDetailsResponse,
  UpdateCubesRequestDetailsRequest,
  UpdateCubesRequestDetailsResponse,
  ListCubesRequestDetailsResponse, // Import List response type
} from "metabase-types/api/cubes_requests";
import { Api } from "./api";
import {
  provideCubesRequestTags,
  invalidateTags,
  listTag,
  idTag,
} from "./tags";

export const cubesRequestsApi = Api.injectEndpoints({
  endpoints: builder => ({
    // Get all cubes request details
    listCubesRequestDetails: builder.query<any, void>({
      query: () => ({
        method: "GET",
        url: `/api/cubes_requests`,
      }),
      providesTags: response =>
        response && response.data
          ? response.data.flatMap(provideCubesRequestTags)
          : [], // This should provide the correct list and item tags
    }),

    // Get cubes request details by ID
    getCubesRequestDetails: builder.query<
      GetCubesRequestDetailsResponse,
      { id: number }
    >({
      query: ({ id }) => ({
        method: "GET",
        url: `/api/cubes_requests/${id}`,
      }),
      providesTags: response =>
        response ? provideCubesRequestTags(response) : [],
    }),

    // Create new cubes request details
    createCubesRequestDetails: builder.mutation<
      CreateCubesRequestDetailsResponse,
      CreateCubesRequestDetailsRequest
    >({
      query: body => ({
        method: "POST",
        url: "/api/cubes_requests",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("cubes_requests")]),
    }),

    // Update existing cubes request details
    updateCubesRequestDetails: builder.mutation<
      UpdateCubesRequestDetailsResponse,
      UpdateCubesRequestDetailsRequest
    >({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/cubes_requests/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("cubes_requests"),
          idTag("cubes_requests", id),
        ]), // Ensures refetching of the list after an update
    }),
  }),
});

// Export hooks for usage in function components
export const {
  useListCubesRequestDetailsQuery, // New hook for fetching all requests
  useGetCubesRequestDetailsQuery,
  useCreateCubesRequestDetailsMutation,
  useUpdateCubesRequestDetailsMutation,
} = cubesRequestsApi;
