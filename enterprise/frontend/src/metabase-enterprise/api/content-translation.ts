import { invalidateTags, listTag } from "metabase/api/tags";
import { contentTranslationEndpoints } from "metabase-enterprise/content_translation/constants";
import type { DictionaryResponse } from "metabase-types/api/content-translation";

import { EnterpriseApi } from "./api";

type ListContentTranslationsRequest = {
  locale?: string;
};

export const contentTranslationApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => {
    return {
      listContentTranslations: builder.query<
        DictionaryResponse,
        ListContentTranslationsRequest | void
      >({
        query: (params) => ({
          method: "GET",
          url: contentTranslationEndpoints.getDictionary,
          params,
        }),
        providesTags: () => [listTag("content-translation")],
      }),
      uploadContentTranslationDictionary: builder.mutation<
        { success: boolean },
        { file: File }
      >({
        query: ({ file }) => {
          const formData = new FormData();
          formData.append("file", file);

          return {
            method: "POST",
            url: contentTranslationEndpoints.uploadDictionary,
            body: { formData },
            formData: true,
            fetch: true,
          };
        },
        invalidatesTags: (_, error) =>
          invalidateTags(error, [listTag("content-translation")]),
      }),
    };
  },
});

export const {
  useListContentTranslationsQuery,
  useUploadContentTranslationDictionaryMutation,
} = contentTranslationApi;
