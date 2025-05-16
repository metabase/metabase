import { useMemo } from "react";

import type {
  AlertNotification,
  CreateNotificationRequest,
  GetNotificationPayloadExampleRequest,
  GetNotificationPayloadExampleResponse,
  ListNotificationsRequest,
  Notification,
  NotificationChannelType,
  NotificationId,
  PreviewNotificationTemplateRequest,
  PreviewNotificationTemplateResponse,
  TableNotification,
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
      invalidatesTags: (notification, error) =>
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
    getNotificationPayloadExample: builder.query<
      Record<NotificationChannelType, any>,
      GetNotificationPayloadExampleRequest
    >({
      query: (body) => ({
        method: "POST",
        url: `/api/notification/payload`,
        body,
      }),
      transformResponse(response: GetNotificationPayloadExampleResponse) {
        return Object.keys(response).reduce(
          (acc, key) => {
            acc[key as NotificationChannelType] =
              response[key as NotificationChannelType].payload;
            return acc;
          },
          {} as Record<NotificationChannelType, any>,
        );
      },
    }),
    getDefaultNotificationTemplate: builder.query<
      Record<
        string,
        {
          channel_type: string;
          details: {
            type: string;
            subject?: string;
            body: string;
          };
        }
      >,
      {
        notification: {
          payload_type: string;
          payload: Record<string, unknown>;
        };
        channel_types: string[];
      }
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/notification/default_template",
        body,
      }),
    }),
    previewNotificationTemplate: builder.query<
      PreviewNotificationTemplateResponse,
      PreviewNotificationTemplateRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/notification/preview_template",
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
  useGetNotificationPayloadExampleQuery,
  useGetDefaultNotificationTemplateQuery,
  usePreviewNotificationTemplateQuery,
  useLazyPreviewNotificationTemplateQuery,
} = notificationApi;

export const useTableNotificationsQuery = (
  params: Parameters<typeof useListNotificationsQuery>[0],
) => {
  const { data, ...rest } = useListNotificationsQuery(params);
  return {
    data: useMemo(() => data?.filter(isTableNotification), [data]),
    ...rest,
  };
};

export const useAlertNotificationsQuery = (
  params: Parameters<typeof useListNotificationsQuery>[0],
) => {
  const { data, ...rest } = useListNotificationsQuery(params);
  return {
    data: useMemo(() => data?.filter(isAlertNotification), [data]),
    ...rest,
  };
};

export const isTableNotification = (
  notification: Notification,
): notification is TableNotification => {
  return notification.payload_type === "notification/system-event";
};

export const isAlertNotification = (
  notification: Notification,
): notification is AlertNotification => {
  return notification.payload_type === "notification/card";
};
