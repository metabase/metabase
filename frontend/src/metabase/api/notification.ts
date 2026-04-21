import type {
  AdminNotificationDetail,
  AdminNotificationListParams,
  AdminNotificationListResponse,
  AdminNotificationSendHistoryParams,
  AdminNotificationSendHistoryResponse,
  BulkNotificationPayload,
  CreateNotificationRequest,
  ListNotificationsRequest,
  Notification,
  NotificationId,
  UpdateNotificationRequest,
} from "metabase-types/api/notification";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideNotificationListTags,
  provideNotificationTags,
} from "./tags";

const ADMIN_LIST_TAG_ID = "LIST-ADMIN";

export const notificationApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listNotifications: builder.query<
      Notification[],
      ListNotificationsRequest | void
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/notification",
        params,
      }),
      providesTags: (notifications = []) =>
        provideNotificationListTags(notifications),
    }),
    getNotification: builder.query<Notification, NotificationId>({
      query: (id) => ({
        method: "GET",
        url: `/api/notification/${id}`,
      }),
      providesTags: (notification) =>
        notification ? provideNotificationTags(notification) : [],
    }),
    createNotification: builder.mutation<
      Notification,
      CreateNotificationRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/notification",
        body,
      }),
      invalidatesTags: (_notification, error) =>
        invalidateTags(error, [listTag("notification")]),
    }),
    updateNotification: builder.mutation<
      Notification,
      UpdateNotificationRequest
    >({
      query: (body) => ({
        method: "PUT",
        url: `/api/notification/${body.id}`,
        body,
      }),
      invalidatesTags: (notification, error) =>
        invalidateTags(error, [
          listTag("notification"),
          ...(notification ? [idTag("notification", notification.id)] : []),
        ]),
    }),
    unsubscribeFromNotification: builder.mutation<Notification, NotificationId>(
      {
        query: (id) => ({
          method: "POST",
          url: `/api/notification/${id}/unsubscribe`,
        }),
        invalidatesTags: (notification, error) =>
          invalidateTags(error, [
            listTag("notification"),
            ...(notification ? [idTag("notification", notification.id)] : []),
          ]),
      },
    ),
    sendUnsavedNotification: builder.mutation<
      void,
      CreateNotificationRequest | UpdateNotificationRequest
    >({
      query: (body) => ({
        method: "POST",
        url: `/api/notification/send`,
        body,
      }),
    }),
    adminListNotifications: builder.query<
      AdminNotificationListResponse,
      AdminNotificationListParams | void
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/admin/notifications",
        params: params ?? undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              { type: "notification", id: ADMIN_LIST_TAG_ID },
              ...result.data.map((notification) =>
                idTag("notification", notification.id),
              ),
            ]
          : [{ type: "notification", id: ADMIN_LIST_TAG_ID }],
    }),
    bulkNotificationAction: builder.mutation<
      { updated: number },
      BulkNotificationPayload
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/admin/notifications/bulk",
        body,
      }),
      invalidatesTags: (_result, error, { notification_ids }) =>
        invalidateTags(error, [
          { type: "notification", id: ADMIN_LIST_TAG_ID },
          ...notification_ids.map((id) => idTag("notification", id)),
        ]),
    }),
    adminNotificationDetail: builder.query<
      AdminNotificationDetail,
      NotificationId
    >({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/admin/notifications/${id}`,
      }),
      providesTags: (result) =>
        result ? [idTag("notification", result.id)] : [],
    }),
    adminNotificationSendHistory: builder.query<
      AdminNotificationSendHistoryResponse,
      AdminNotificationSendHistoryParams
    >({
      query: ({ id, limit, offset }) => ({
        method: "GET",
        url: `/api/ee/admin/notifications/${id}/send-history`,
        params: { limit, offset },
      }),
      providesTags: (_result, _error, { id }) => [idTag("notification", id)],
    }),
  }),
});

export const invalidateNotificationsApiCache = () => {
  return notificationApi.util.invalidateTags([listTag("notification")]);
};

export const {
  useListNotificationsQuery,
  useGetNotificationQuery,
  useCreateNotificationMutation,
  useUpdateNotificationMutation,
  useUnsubscribeFromNotificationMutation,
  useSendUnsavedNotificationMutation,
  useAdminListNotificationsQuery,
  useBulkNotificationActionMutation,
  useAdminNotificationDetailQuery,
  useAdminNotificationSendHistoryQuery,
} = notificationApi;
