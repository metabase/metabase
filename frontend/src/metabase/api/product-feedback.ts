import { Api } from "./api";

export const productFeedbackApi = Api.injectEndpoints({
  endpoints: builder => ({
    sendProductFeedback: builder.mutation<
      void,
      { comments: string; email?: string }
    >({
      query: ({ comments, email }) => ({
        method: "POST",
        url: `/api/product-feedback`,
        body: { comments, email },
      }),
    }),
  }),
});

export const { useSendProductFeedbackMutation } = productFeedbackApi;
