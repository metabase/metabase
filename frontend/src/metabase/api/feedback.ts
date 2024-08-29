import { invalidateTags, listTag } from "./tags";
import type { Feedback } from "metabase-types/api";
import { Api } from "./api";
// Update the API configuration for feedback
export const feedbackApi = Api.injectEndpoints({
  endpoints: builder => ({
    submitFeedback: builder.mutation<void, Feedback>({
      query: body => ({
        method: "POST",
        url: "/api/feedback",
        body, // Explicitly stringify the body
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("feedback")]),
    }),
  }),
});

// Export the auto-generated hooks for the endpoints
export const { useSubmitFeedbackMutation } = feedbackApi;
