import { updateMetadata } from "metabase/lib/redux/metadata";
import { MeasureSchema } from "metabase/schema";
import type {
  CreateMeasureRequest,
  FieldValue,
  GetMeasureDimensionValuesRequest,
  GetMeasureDimensionValuesResponse,
  GetRemappedMeasureDimensionValueRequest,
  Measure,
  MeasureId,
  SearchMeasureDimensionValuesRequest,
  UpdateMeasureRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideMeasureListTags,
  provideMeasureTags,
  tag,
} from "./tags";
import { handleQueryFulfilled } from "./utils/lifecycle";

export const measureApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listMeasures: builder.query<Measure[], void>({
      query: () => ({
        method: "GET",
        url: "/api/measure",
      }),
      providesTags: (measures = []) => provideMeasureListTags(measures),
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, [MeasureSchema])),
        ),
    }),
    getMeasure: builder.query<Measure, MeasureId>({
      query: (id) => ({
        method: "GET",
        url: `/api/measure/${id}`,
      }),
      providesTags: (measure) => (measure ? provideMeasureTags(measure) : []),
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, MeasureSchema)),
        ),
    }),
    getMeasureDimensionValues: builder.query<
      GetMeasureDimensionValuesResponse,
      GetMeasureDimensionValuesRequest
    >({
      query: ({ measureId, dimensionId }) => ({
        method: "GET",
        url: `/api/measure/${measureId}/dimension/${encodeURIComponent(dimensionId)}/values`,
      }),
    }),
    searchMeasureDimensionValues: builder.query<
      FieldValue[],
      SearchMeasureDimensionValuesRequest
    >({
      query: ({ measureId, dimensionId, ...params }) => ({
        method: "GET",
        url: `/api/measure/${measureId}/dimension/${encodeURIComponent(dimensionId)}/search`,
        params,
      }),
    }),
    getRemappedMeasureDimensionValue: builder.query<
      FieldValue,
      GetRemappedMeasureDimensionValueRequest
    >({
      query: ({ measureId, dimensionId, value }) => ({
        method: "GET",
        url: `/api/measure/${measureId}/dimension/${encodeURIComponent(dimensionId)}/remapping`,
        params: { value },
      }),
    }),
    createMeasure: builder.mutation<Measure, CreateMeasureRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/measure",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("measure"), tag("table")]),
    }),
    updateMeasure: builder.mutation<Measure, UpdateMeasureRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/measure/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("measure"),
          idTag("measure", id),
          tag("table"),
        ]),
    }),
  }),
});

export const {
  useListMeasuresQuery,
  useGetMeasureQuery,
  useGetMeasureDimensionValuesQuery,
  useSearchMeasureDimensionValuesQuery,
  useGetRemappedMeasureDimensionValueQuery,
  useCreateMeasureMutation,
  useUpdateMeasureMutation,
} = measureApi;
