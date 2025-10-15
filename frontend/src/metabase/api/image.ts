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
    }),
    getImageData: builder.query<
      { name: string; image_url: string },
      { id: number }
    >({
      query: ({ id }) => ({
        url: `/api/images/${id}`,
      }),
    }),
  }),
});

export const { useUploadImageMutation, useGetImageDataQuery } = imageApi;
