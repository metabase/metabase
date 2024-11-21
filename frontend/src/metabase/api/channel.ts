import type { ChannelDetails, NotificationChannel } from "metabase-types/api";

import { Api } from "./api";
import { idTag, invalidateTags, listTag, provideChannelListTags } from "./tags";

const channelApi = Api.injectEndpoints({
  endpoints: builder => ({
    listChannels: builder.query<NotificationChannel[], void>({
      query: () => `api/channel`,
      providesTags: (channels = []) => provideChannelListTags(channels),
    }),
    testChannel: builder.mutation<
      Record<string, any>,
      { details: Omit<ChannelDetails, "fe-form-type"> }
    >({
      query: body => ({
        method: "POST",
        url: "api/channel/test",
        body: {
          ...body,
          type: "channel/http",
        },
      }),
    }),
    createChannel: builder.mutation<
      NotificationChannel[],
      Omit<NotificationChannel, "created_at" | "updated_at" | "active" | "id">
    >({
      query: body => ({
        method: "POST",
        url: "api/channel",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("channel")]),
    }),
    editChannel: builder.mutation<
      NotificationChannel[],
      Omit<NotificationChannel, "created_at" | "updated_at" | "active" | "type">
    >({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `api/channel/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("channel"), idTag("channel", id)]),
    }),
    deleteChannel: builder.mutation<void, number>({
      query: id => ({
        method: "PUT",
        url: `api/channel/${id}`,
        body: {
          active: false,
        },
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("channel")]),
    }),
  }),
});

export const {
  useListChannelsQuery,
  useEditChannelMutation,
  useCreateChannelMutation,
  useDeleteChannelMutation,
  useTestChannelMutation,
  endpoints: { listChannels },
} = channelApi;
