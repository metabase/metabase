import type { VerifyItemRequest } from "metabase-types/api";

import { Api } from "./api";
import { invalidateTags, provideModeratedItemTags } from "./tags";

export const contentVerificationApi = Api.injectEndpoints({
  endpoints: builder => ({
    editItemVerification: builder.mutation<void, VerifyItemRequest>({
      query: req => ({
        method: "POST",
        url: "/api/moderation-review",
        body: req,
      }),
      invalidatesTags: (
        _res,
        error,
        { moderated_item_id, moderated_item_type },
      ) =>
        invalidateTags(
          error,
          provideModeratedItemTags(moderated_item_type, moderated_item_id),
        ),
    }),
  }),
});

export const { useEditItemVerificationMutation } = contentVerificationApi;
