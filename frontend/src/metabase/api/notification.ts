import type {
  AdminNotificationDetail,
  AdminNotificationListParams,
  AdminNotificationListResponse,
  BulkNotificationPayload,
  CreateNotificationRequest,
  ListNotificationsRequest,
  Notification,
  NotificationId,
  UnsubscribeRequest,
  UnsubscribeResponse,
  UpdateNotificationRequest,
} from "metabase-types/api/notification";

import { Api } from "./api";
import {
  adminNotificationListTag,
  idTag,
  invalidateTags,
  listTag,
  provideAdminNotificationListTags,
  provideAdminNotificationTags,
  provideNotificationListTags,
  provideNotificationTags,
} from "./tags";

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
        invalidateTags(error, [
          listTag("notification"),
          adminNotificationListTag(),
        ]),
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
          adminNotificationListTag(),
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
        url: "/api/notification/admin",
        params: params ?? undefined,
      }),
      providesTags: (result) =>
        result
          ? provideAdminNotificationListTags(result.data)
          : [adminNotificationListTag()],
    }),
    bulkNotificationAction: builder.mutation<
      { updated: number },
      BulkNotificationPayload
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/notification/admin/bulk",
        body,
      }),
      invalidatesTags: (_result, error, { notification_ids }) =>
        invalidateTags(
          error,
          provideAdminNotificationListTags(
            notification_ids.map((id) => ({ id })),
          ),
        ),
    }),
    adminNotificationDetail: builder.query<
      AdminNotificationDetail,
      NotificationId
    >({
      query: (id) => ({
        method: "GET",
        url: `/api/notification/admin/${id}`,
      }),
      providesTags: (result) =>
        result ? provideAdminNotificationTags(result) : [],
    }),
    unsubscribeFromNotificationByEmail: builder.mutation<
      UnsubscribeResponse,
      UnsubscribeRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/notification/unsubscribe",
        body,
      }),
    }),
    undoUnsubscribeFromNotificationByEmail: builder.mutation<
      UnsubscribeResponse,
      UnsubscribeRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/notification/unsubscribe/undo",
        body,
      }),
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
  useUnsubscribeFromNotificationByEmailMutation,
  useUndoUnsubscribeFromNotificationByEmailMutation,
} = notificationApi;
