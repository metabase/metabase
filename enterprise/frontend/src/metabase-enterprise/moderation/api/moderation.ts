import { invalidateTags, provideModeratedItemTags } from "metabase/api/tags";
import { EnterpriseApi } from "metabase-enterprise/api/api";
import type { VerifyItemRequest } from "metabase-types/api";

export const contentVerificationApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    editItemVerification: builder.mutation<void, VerifyItemRequest>({
      query: (req) => ({
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
