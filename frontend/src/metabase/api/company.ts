import {
  CreateCompanyDetailsRequest,
  CreateCompanyDetailsResponse,
  GetCompanyDetailsRequest,
  GetCompanyDetailsResponse,
  UpdateCompanyDetailsRequest,
  UpdateCompanyDetailsResponse,
} from "metabase-types/api/company";
import { Api } from "./api";
import {
  provideCompanyDetailsTags,
  invalidateTags,
  listTag,
  idTag,
} from "./tags";

export const companyApi = Api.injectEndpoints({
  endpoints: builder => ({
    // Get company details
    getCompanyDetails: builder.query<
      GetCompanyDetailsResponse,
      GetCompanyDetailsRequest
    >({
      query: ({ id }) => ({
        method: "GET",
        url: `/api/company/${id}`,
      }),
      providesTags: response =>
        response ? provideCompanyDetailsTags(response) : [],
    }),

    // Create new company details
    createCompanyDetails: builder.mutation<
      CreateCompanyDetailsResponse,
      CreateCompanyDetailsRequest
    >({
      query: body => ({
        method: "POST",
        url: "/api/company",
        body,
      }),
      invalidatesTags: (response, error) =>
        response
          ? [
              ...invalidateTags(error, [listTag("company")]),
              ...invalidateTags(error, [
                idTag("company", response.id ?? "root"),
              ]),
            ]
          : [],
    }),

    // Update existing company details
    updateCompanyDetails: builder.mutation<
      UpdateCompanyDetailsResponse,
      UpdateCompanyDetailsRequest
    >({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/company/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("company"), idTag("company", id)]),
    }),
  }),
});

// Export hooks for usage in function components
export const {
  useGetCompanyDetailsQuery,
  useCreateCompanyDetailsMutation,
  useUpdateCompanyDetailsMutation,
} = companyApi;
