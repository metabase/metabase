import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, providePythonLibraryTags } from "./tags";

export type PythonLibrary = {
  path: string;
  source: string;
};

export type GetPythonLibraryRequest = {
  path: string;
};

export type UpdatePythonLibraryRequest = {
  path: string;
  source: string;
};

export const pythonLibraryApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPythonLibrary: builder.query<PythonLibrary, GetPythonLibraryRequest>({
      query: ({ path }) => ({
        url: `/api/ee/python-transform/library/${path}`,
        method: "GET",
      }),
      providesTags: (library) =>
        library ? providePythonLibraryTags(library) : [],
    }),
    updatePythonLibrary: builder.mutation<void, UpdatePythonLibraryRequest>({
      query: ({ path, source }) => ({
        url: `/api/ee/python-transform/library/${path}`,
        method: "PUT",
        body: { source },
      }),
      invalidatesTags: (_, error, { path }) =>
        invalidateTags(error, [idTag("python-transform-library", path)]),
    }),
  }),
});

export const { useGetPythonLibraryQuery, useUpdatePythonLibraryMutation } =
  pythonLibraryApi;
