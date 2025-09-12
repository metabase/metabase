import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, providePythonLibraryTags } from "./tags";

export type PythonLibrary = {
  name: string;
  source: string;
};

export type GetPythonLibraryRequest = {
  name: string;
};

export type UpdatePythonLibraryRequest = {
  name: string;
  source: string;
};

export const pythonLibraryApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPythonLibrary: builder.query<PythonLibrary, GetPythonLibraryRequest>({
      query: ({ name }) => ({
        url: `/api/ee/python-transform/library/${name}`,
        method: "GET",
      }),
      providesTags: (library) =>
        library ? providePythonLibraryTags(library) : [],
    }),
    updatePythonLibrary: builder.mutation<void, UpdatePythonLibraryRequest>({
      query: ({ name, source }) => ({
        url: `/api/ee/python-transform/library/${name}`,
        method: "PUT",
        body: { source },
      }),
      invalidatesTags: (_, error, { name }) =>
        invalidateTags(error, [idTag("python-transform-library", name)]),
    }),
  }),
});

export const { useGetPythonLibraryQuery, useUpdatePythonLibraryMutation } =
  pythonLibraryApi;
