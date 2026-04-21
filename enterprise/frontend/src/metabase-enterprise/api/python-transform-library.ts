import type {
  GetPythonLibraryRequest,
  PythonLibrary,
  UpdatePythonLibraryRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, providePythonLibraryTags } from "./tags";

export const pythonLibraryApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPythonLibrary: builder.query<PythonLibrary, GetPythonLibraryRequest>({
      query: ({ path }) => ({
        url: `/api/ee/transforms-python/library/${path}`,
        method: "GET",
      }),
      providesTags: (library) =>
        library ? providePythonLibraryTags(library) : [],
    }),
    updatePythonLibrary: builder.mutation<void, UpdatePythonLibraryRequest>({
      query: ({ path, source }) => ({
        url: `/api/ee/transforms-python/library/${path}`,
        method: "PUT",
        body: { source },
      }),
      invalidatesTags: (_, error, { path }) =>
        invalidateTags(error, [idTag("python-transform-library", path)]),
      onQueryStarted: async (
        { path, ...patch },
        { dispatch, queryFulfilled },
      ) => {
        const patchResult = dispatch(
          pythonLibraryApi.util.updateQueryData(
            "getPythonLibrary",
            { path },
            (draft) => {
              Object.assign(draft, patch);
            },
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
    }),
  }),
});

export const { useGetPythonLibraryQuery, useUpdatePythonLibraryMutation } =
  pythonLibraryApi;
