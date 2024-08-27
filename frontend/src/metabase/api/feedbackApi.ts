import {
  createApi,
  fetchBaseQuery,
  skipToken,
} from "@reduxjs/toolkit/query/react";
export { skipToken };

import { TAG_TYPES } from "./tags";
import {
  idTag,
  invalidateTags,
  listTag,
  provideFeedbackTags,
  provideFeedbackListTags,
} from "./tags";

export const server = "http://localhost:3000";

export const FeedbackApi = createApi({
  reducerPath: "feedback-api",
  tagTypes: TAG_TYPES,
  baseQuery: fetchBaseQuery({
    baseUrl: server,
  }),
  endpoints: builder => ({
    submitFeedback: builder.mutation<
      any,
      {
        submitted_by: string | null;
        task: string | null;
        chat_history: string | null;
        description: string | null;
        subject: string | null;
      }
    >({
      query: feedback => ({
        method: "POST",
        url: `/api/feedback`,
        body: feedback,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          listTag("feedback"), // Invalidate the list of feedback if needed
        ]),
    }),
  }),
});

// Export the auto-generated hooks for the endpoints
export const { useSubmitFeedbackMutation } = FeedbackApi;
