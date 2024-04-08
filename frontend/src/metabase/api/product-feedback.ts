import { Api } from "./api";

const productFeedbackApi = Api.injectEndpoints({
  endpoints: builder => ({
    sendProductFeedback: builder.mutation<
      void,
      { comments: string; email?: string; source: string }
    >({
      query: ({ comments, email, source }) => ({
        method: "POST",
        url: `/api/util/product-feedback`,
        body: { comments, email, source },
      }),
    }),
  }),
});

export const { useSendProductFeedbackMutation } = productFeedbackApi;
