import { CheckpointsApi } from "./checkpointsApi";
import { invalidateTags, listTag, provideFeedbackListTags } from "./tags";

// Define a new API configuration for feedback
export const feedbackApi = CheckpointsApi.injectEndpoints({
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
        body: feedback, // Sending the feedback data in the body of the request
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("feedback")]), // Properly invalidate feedback tags
    }),
  }),
});

// Export the auto-generated hook for submitting feedback
export const { useSubmitFeedbackMutation } = feedbackApi;
