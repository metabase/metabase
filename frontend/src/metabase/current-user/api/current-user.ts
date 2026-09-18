import type { TagDescription } from "@reduxjs/toolkit/query";

import { Api } from "metabase/api/api";
import type { TagType } from "metabase/api/tags";
import { idTag, invalidateTags } from "metabase/api/tags";
import type { User, UserId } from "metabase-types/api";

const provideCurrentUserTags = (user: User): TagDescription<TagType>[] => {
  const tags = [idTag("current-user", user.id)];

  // api/dashboard.ts invalidates this tag when the homepage dashboard is archived.
  if (user.custom_homepage) {
    tags.push(
      idTag("user-homepage-dashboard", user.custom_homepage.dashboard_id),
    );
  }

  return tags;
};

export const currentUserApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getCurrentUser: builder.query<User, void>({
      query: () => ({
        method: "GET",
        url: "/api/user/current",
      }),
      providesTags: (user) => (user ? provideCurrentUserTags(user) : []),
      // Don't garbage-collect the current user from the cache
      // since it's used in many places and we don't want to refetch it unnecessarily.
      keepUnusedDataFor: Infinity,
    }),
    updateUserModalQbnewb: builder.mutation<void, UserId>({
      query: (id) => ({
        method: "PUT",
        url: `/api/user/${id}/modal/qbnewb`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("user", id), idTag("current-user", id)]),
    }),
  }),
});

export const loadCurrentUser = () =>
  currentUserApi.endpoints.getCurrentUser.initiate();

export const refetchCurrentUser = () =>
  currentUserApi.endpoints.getCurrentUser.initiate(undefined, {
    forceRefetch: true,
  });

export const { useGetCurrentUserQuery, useLazyGetCurrentUserQuery } =
  currentUserApi;
