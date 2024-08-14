import { CubeDataResponse, GetCubeDataRequest, UpdateCubeDataRequest } from "metabase-types/api";
import { Api } from "./api";
import { CubeApi } from "./cubeApi";
import { provideCubeDataTags } from "./tags";
import { invalidateTags, tag, idTag } from "./tags";

const {CUBE_JS_TOKEN} = process.env

export const cubeDataApi = CubeApi.injectEndpoints({
    endpoints: builder => ({
        getCubeData: builder.query<CubeDataResponse, GetCubeDataRequest | void>({
            query: () => ({
                method: 'GET',
                url: `/company/company-cube-files/omni_test`,
            }),
            transformResponse: (response: Record<string, unknown>) => {
                return Object.entries(response).map(([fileName, content]) => ({
                    fileName,
                    content,
                }))
            },
            providesTags: (result) => {
                return provideCubeDataTags(result ?? [])
            } 
        }),
        updateCubeData: builder.mutation<void, UpdateCubeDataRequest>({
            query: (updateData) => ({
                url: `/company/edit-cube-files/${updateData.company_name}`,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: updateData.payload,
            }),
            invalidatesTags: (_, error, { company_name }) =>
                invalidateTags(error, [
                  tag("company-name"),
                ]),
        })
    })
})

export const {
    useGetCubeDataQuery,
    useUpdateCubeDataMutation
} = cubeDataApi