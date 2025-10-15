import { Api } from "./api";

type UploadImageRequest = {
  file: File;
} & (
  | { collectionId: number; userId?: never }
  | { userId: number; collectionId?: never }
);

export const imageApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    uploadImage: builder.mutation<{ image_url: string }, UploadImageRequest>({
      query: ({ file, collectionId, userId }) => {
        const bodyFormData = new FormData();
        bodyFormData.append("file", file);
        const queryParams = userId
          ? `?user_id=${userId}`
          : `?collection_id=${collectionId}`;
        return {
          url: `/api/images${queryParams}`,
          method: "POST",
          headers: {
            "Content-Type": "multipart/form-data;",
          },
          body: bodyFormData,
          formData: true,
        };
      },
    }),
  }),
});

export const { useUploadImageMutation } = imageApi;
