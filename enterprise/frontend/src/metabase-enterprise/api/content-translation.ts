import { invalidateTags, listTag } from "metabase/api/tags";
import type { DictionaryArray } from "metabase/i18n/types";

import { EnterpriseApi } from "./api";

type ListContentTranslationsRequest = {
  locale: string;
};

type UploadContentTranslationDictionaryRequest = {
  file: File;
};

export const contentTranslationApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => {
    return {
      listContentTranslations: builder.query<
        { data: DictionaryArray },
        ListContentTranslationsRequest | void
      >({
        query: (params) => ({
          method: "GET",
          url: "/api/ee/content-translation/dictionary",
          params,
        }),
        providesTags: () => [listTag("content-translation")],
      }),
      uploadContentTranslationDictionary: builder.mutation<
        DictionaryArray,
        UploadContentTranslationDictionaryRequest
      >({
        query: ({ file }) => {
          const formData = new FormData();
          formData.append("file", file);

          return {
            method: "POST",
            url: "/api/ee/content-translation/upload-dictionary",
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
