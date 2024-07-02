import { Api } from "./api";

const productFeedbackApi = Api.injectEndpoints({
  endpoints: builder => ({
    sendProductFeedback: builder.mutation<
      void,
      { comment?: string; email?: string; source: string }
    >({
      query: ({ comment, email, source }) => ({
        method: "POST",
        url: `/api/util/product-feedback`,
        body: {
          // harbormaster expects the field `comments`, we use `comment` because it
          // reflects better what it's shown in the UI
          comments: comment,
          email,
          source,
        },
      }),
    }),
  }),
});

export const { useSendProductFeedbackMutation } = productFeedbackApi;
