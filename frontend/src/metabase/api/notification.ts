import type {
  AdminNotificationDetail,
  AdminNotificationListParams,
  AdminNotificationListResponse,
  BulkNotificationPayload,
  CreateNotificationRequest,
  ListNotificationsRequest,
  Notification,
  NotificationId,
  UpdateNotificationRequest,
  WireAdminNotificationDetail,
  WireAdminNotificationListResponse,
} from "metabase-types/api/notification";
import { wireToAdminNotification } from "metabase-types/api/notification";

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

// The admin endpoints speak `creator_*` on the wire (matching the public
// /api/notification endpoints). The FE uses `owner_*` everywhere; we translate
// requests/responses here so "owner" never leaves the frontend.
const toWireListParams = (params?: AdminNotificationListParams | void) => {
  if (!params) {
    return undefined;
  }
  const { owner_id, owner_active, ownerless, sort_column, ...rest } = params;
  return {
    ...rest,
    ...(owner_id !== undefined ? { creator_id: owner_id } : {}),
    ...(owner_active !== undefined ? { creator_active: owner_active } : {}),
    ...(ownerless !== undefined ? { creatorless: ownerless } : {}),
    ...(sort_column !== undefined
      ? { sort_column: sort_column === "owner_name" ? "creator_name" : sort_column }
      : {}),
  };
};

const toWireBulkPayload = ({
  action,
  owner_id,
  ...rest
}: BulkNotificationPayload) => ({
  ...rest,
  action: action === "change-owner" ? "change-creator" : action,
  ...(owner_id !== undefined ? { creator_id: owner_id } : {}),
});

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
        url: "/api/ee/notifications",
        params: toWireListParams(params),
      }),
      transformResponse: (
        response: WireAdminNotificationListResponse,
      ): AdminNotificationListResponse => ({
        ...response,
        data: response.data.map(wireToAdminNotification),
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
        url: "/api/ee/notifications/bulk",
        body: toWireBulkPayload(body),
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
        url: `/api/ee/notifications/${id}`,
      }),
      transformResponse: (
        response: WireAdminNotificationDetail,
      ): AdminNotificationDetail => wireToAdminNotification(response),
      providesTags: (result) =>
        result ? provideAdminNotificationTags(result) : [],
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
} = notificationApi;
