import type {
  Alert,
  AlertId,
  CreateAlertRequest,
  ListAlertsRequest,
  ListCardAlertsRequest,
  UpdateAlertRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideAlertListTags,
  provideAlertTags,
} from "./tags";

export const alertApi = Api.injectEndpoints({
  endpoints: builder => ({
    listAlerts: builder.query<Alert[], ListAlertsRequest | void>({
      query: params => ({
        method: "GET",
        url: "/api/alert",
        params,
      }),
      providesTags: (alerts = []) => provideAlertListTags(alerts),
    }),
    listCardAlerts: builder.query<Alert[], ListCardAlertsRequest>({
      query: ({ id, ...params }) => ({
        method: "GET",
        url: `/api/alert/question/${id}`,
        params,
      }),
      providesTags: (alerts = []) => provideAlertListTags(alerts),
    }),
    getAlert: builder.query<Alert, AlertId>({
      query: id => ({
        method: "GET",
        url: `/api/alert/${id}`,
      }),
      providesTags: alert => (alert ? provideAlertTags(alert) : []),
    }),
    createAlert: builder.mutation<Alert, CreateAlertRequest>({
      query: body => ({
        method: "POST",
        url: "/api/alert",
        body,
      }),
      invalidatesTags: (alert, error) =>
        invalidateTags(error, [listTag("alert")]),
    }),
    updateAlert: builder.mutation<Alert, UpdateAlertRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/alert/${id}`,
        body,
      }),
      invalidatesTags: (alert, error) =>
        invalidateTags(error, [
          listTag("alert"),
          ...(alert ? [idTag("alert", alert.id)] : []),
        ]),
    }),
    deleteAlertSubscription: builder.mutation<void, AlertId>({
      query: id => ({
        method: "DELETE",
        url: `/api/alert/${id}/subscription`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("alert"), idTag("alert", id)]),
    }),
  }),
});

export const {
  useListAlertsQuery,
  useListCardAlertsQuery,
  useGetAlertQuery,
  useCreateAlertMutation,
  useUpdateAlertMutation,
  useDeleteAlertSubscriptionMutation,
} = alertApi;
