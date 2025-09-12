import { Api } from "metabase/api";

export type PythonLibrary = {
  source: string;
};

export type GetPythonLibraryRequest = {
  name: string;
};

export type UpdatePythonLibraryRequest = {
  name: string;
  source: string;
};

export const pythonLibraryApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getPythonLibrary: builder.query<PythonLibrary, GetPythonLibraryRequest>({
      query: ({ name }) => ({
        url: `/api/ee/python-transform/library/${name}`,
        method: "GET",
      }),
    }),
    updatePythonLibrary: builder.mutation<void, UpdatePythonLibraryRequest>({
      query: ({ name, source }) => ({
        url: `/api/ee/python-transform/library/${name}`,
        method: "PUT",
        body: { source },
      }),
    }),
  }),
});

export const { useGetPythonLibraryQuery, useUpdatePythonLibraryMutation } =
  pythonLibraryApi;
