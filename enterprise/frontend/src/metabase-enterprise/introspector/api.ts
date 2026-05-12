import { EnterpriseApi } from "metabase-enterprise/api/api";

import type {
  IntrospectorListParams,
  IntrospectorListResponse,
  IntrospectorSummary,
} from "./types";

const TAG_SUMMARY = { type: "introspector-summary", id: "ALL" } as const;
const tagFor = (kind: "cards" | "dashboards" | "transforms") =>
  ({ type: "introspector-list", id: kind }) as const;

export const introspectorApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getIntrospectorSummary: builder.query<IntrospectorSummary, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/introspector/content/summary",
      }),
      providesTags: [TAG_SUMMARY],
    }),
    listIntrospectorCards: builder.query<
      IntrospectorListResponse,
      IntrospectorListParams
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/introspector/content/cards",
        params,
      }),
      providesTags: [tagFor("cards")],
    }),
    listIntrospectorDashboards: builder.query<
      IntrospectorListResponse,
      IntrospectorListParams
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/introspector/content/dashboards",
        params,
      }),
      providesTags: [tagFor("dashboards")],
    }),
    listIntrospectorTransforms: builder.query<
      IntrospectorListResponse,
      IntrospectorListParams
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/introspector/content/transforms",
        params,
      }),
      providesTags: [tagFor("transforms")],
    }),
  }),
});

export const {
  useGetIntrospectorSummaryQuery,
  useListIntrospectorCardsQuery,
  useListIntrospectorDashboardsQuery,
  useListIntrospectorTransformsQuery,
} = introspectorApi;

export const introspectorInvalidations = {
  cards: [TAG_SUMMARY, tagFor("cards")],
  dashboards: [TAG_SUMMARY, tagFor("dashboards")],
  transforms: [TAG_SUMMARY, tagFor("transforms")],
};
