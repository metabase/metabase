import type { ContentTranslationDictionary } from "metabase/i18n/types";

import { Api } from "./api";
import { invalidateTags, listTag } from "./tags";

type ListContentTranslationsResponse = { data: ContentTranslationDictionary };
type ListContentTranslationsRequest = {
  locale: string;
};

type UploadContentTranslationDictionaryRequest = {
  file: File;
};

export const contentTranslationApi = Api.injectEndpoints({
  endpoints: builder => {
    return {
      listContentTranslations: builder.query<
        ListContentTranslationsResponse,
        ListContentTranslationsRequest | void
      >({
        query: params => ({
          method: "GET",
          url: "/api/dictionary/",
          params,
        }),
        // providesTags: () => listTag("content-translation"),
      }),
      uploadContentTranslationDictionary: builder.mutation<
        ContentTranslationDictionary,
        UploadContentTranslationDictionaryRequest
      >({
        query: ({ file }) => {
          const formData = new FormData();
          formData.append("file", file);

          return {
            method: "POST",
            url: "/api/dictionary/upload",
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
