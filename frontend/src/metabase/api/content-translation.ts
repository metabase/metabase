import type { DictionaryArray, DictionaryMap } from "metabase/i18n/types";

import { Api } from "./api";
import { invalidateTags, listTag } from "./tags";

type ListContentTranslationsResponse = { data: DictionaryArray };
type ListContentTranslationsRequest = {
  locale: string;
};

type UploadContentTranslationDictionaryRequest = {
  file: File;
};

export const contentTranslationApi = Api.injectEndpoints({
  endpoints: (builder) => {
    return {
      listContentTranslations: builder.query<
        DictionaryMap,
        ListContentTranslationsRequest | void
      >({
        query: (params) => ({
          method: "GET",
          url: "/api/ee/content-translation/dictionary",
          params,
        }),

        transformResponse: (
          response: ListContentTranslationsResponse,
        ): DictionaryMap => {
          const dictionaryArray = response.data;

          // Convert the array to a Map for faster lookups
          const dictionaryMap: DictionaryMap =
            dictionaryArray.reduce<DictionaryMap>((map, row) => {
              const { msgid, msgstr } = row;
              if (map.has(msgid)) {
                console.error(
                  `The content translation dictionary has multiple translations for "${msgid}"`,
                );
              }
              map.set(msgid, msgstr);
              return map;
            }, new Map());
          return dictionaryMap;
        },
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
