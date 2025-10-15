import { getCard } from "metabase/query_builder/selectors";

import { Api } from "./api";
import { idTag, invalidateTags } from "./tags";

type UploadImageRequest = {
  file: File;
} & (
  | { collectionId: number; userId?: never }
  | { userId: number; collectionId?: never }
);

type ImageResponse = {
  url: string;
  title: string;
};

export const imageApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    uploadImage: builder.mutation<ImageResponse, UploadImageRequest>({
      query: ({ file, collectionId, userId }) => {
        const bodyFormData = new FormData();
        bodyFormData.append("name", file.name);
        bodyFormData.append("type", file.type);
        bodyFormData.append("file", file);
        const queryParams = userId
          ? `?user-id=${userId}`
          : `?collection-id=${collectionId}`;
        return {
          url: `/api/images${queryParams}`,
          method: "POST",
          headers: {
            "Content-Type": "multipart/form-data;",
          },
          body: { formData: bodyFormData },
          formData: true,
          fetch: true,
        };
      },
      invalidatesTags: (_, error, { collectionId }) =>
        [idTag(`collection-item-list`, collectionId ?? 0)]
    }),
    getImageData: builder.query<
      ImageResponse,
      { id: number }
    >({
      query: ({ id }) => ({
        url: `/api/images/${id}`,
      }),
    }),
    snapshotCard: builder.mutation<{ url: string }, { cardId: number }>({
      query: ({ cardId }) => ({
        method: "POST",
        url: `/api/images/card/${cardId}/snapshot`,
      }),
      invalidatesTags: ({ collection_id }, error, { id: cardId}) => {
        console.log("Invalidating snapshot tags for card", cardId, "in collection", collection_id);
        return invalidateTags(error, [
          idTag("card-snapshot-list", cardId),
          idTag(`collection-item-list`, collection_id ?? 0),
        ]);
      },
    }),
    getCardSnapshots: builder.query<
      { id: number; url: string; created_at: string }[],
      { cardId: number }
    >({
      query: ({ cardId }) => ({
        url: `/api/images/card/${cardId}/snapshots`,
      }),
      providesTags: (response, error, { cardId }) => [
        idTag("card-snapshot-list", cardId),
      ],
    }),
  }),
});

export const {
  useGetImageDataQuery,
  useUploadImageMutation,
  useSnapshotCardMutation,
  useGetCardSnapshotsQuery,
} = imageApi;
