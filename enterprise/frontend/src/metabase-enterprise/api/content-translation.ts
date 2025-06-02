import { invalidateTags, listTag } from "metabase/api/tags";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import type {
  DictionaryResponse,
  DictionaryResponseWithHash,
} from "metabase-types/api/content-translation";

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
          // The URL is currently only set in static embedding
          url: PLUGIN_CONTENT_TRANSLATION.contentTranslationDictionaryUrl,
          params,
        }),
        providesTags: () => [listTag("content-translation")],
      }),
      getCurrentContentTranslations: builder.query<
        DictionaryResponseWithHash,
        void
      >({
        query: () => ({
          method: "GET",
          url: "/api/ee/content-translation/current",
        }),
        providesTags: () => [listTag("content-translation")],
      }),
      uploadContentTranslationDictionary: builder.mutation<
        { success: boolean },
        { file: File; hash?: string }
      >({
        query: ({ file, hash }) => {
          const formData = new FormData();
          formData.append("file", file);

          const url = hash
            ? `/api/ee/content-translation/upload-dictionary?hash=${encodeURIComponent(hash)}`
            : "/api/ee/content-translation/upload-dictionary";

          return {
            method: "POST",
            url,
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
  useGetCurrentContentTranslationsQuery,
  useUploadContentTranslationDictionaryMutation,
} = contentTranslationApi;
