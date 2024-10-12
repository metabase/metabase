import {
  CubeDataResponse,
  GetCubeDataRequest,
  UpdateCubeDataRequest,
  RegisterCubeRequest, // Assuming this type exists for the register request
  DeployCubeRequest,
  CubeStatusResponse,
} from "metabase-types/api";
import { CubeApi } from "./cubeApi";
import { provideCubeDataTags } from "./tags";
import { invalidateTags, tag } from "./tags";

export const cubeDataApi = CubeApi.injectEndpoints({
  endpoints: (builder) => ({
    getCubeData: builder.query<CubeDataResponse, GetCubeDataRequest>({
      query: (data: GetCubeDataRequest) => ({
        method: 'GET',
        url: `/api/getMeta?projectName=${data.projectName}`,
      }),
      providesTags: (result) => {
        return provideCubeDataTags(result ? result.cubes : []);
      },
    }),

    // Existing updateCubeData mutation
    updateCubeData: builder.mutation<void, UpdateCubeDataRequest>({
      query: (updateData) => ({
        url: `/company/edit-cube-files/${updateData.companyName}`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: updateData.payload,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("company-name")]),
    }),

    // New mutation for registering with multiple fields (POST /register)
    registerCubeData: builder.mutation<void, RegisterCubeRequest>({
      query: (registerData) => ({
        url: `/api/register`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: registerData, // registerData will have all the necessary fields
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("cube-registration")]),
    }),

    // New mutation for deploying with just the projectName (POST /deploy)
    deployCubeData: builder.mutation<void, DeployCubeRequest>({
      query: (deployData) => ({
        url: `/deploy`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: { companyName: deployData.companyName }, // Only projectName in the body
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("cube-deployment")]),
    }),

    getCubeStatus: builder.query<CubeStatusResponse, { projectName: string }>({
      query: ({ projectName }) => ({
        method: 'GET',
        url: `/api/status?projectName=${projectName}`,
      }),
    }),
  }),
});

export const {
  useGetCubeDataQuery,
  useUpdateCubeDataMutation,
  useRegisterCubeDataMutation,
  useDeployCubeDataMutation,
  useGetCubeStatusQuery,
} = cubeDataApi;
