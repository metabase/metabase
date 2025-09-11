import { Api } from "metabase/api";

export type PythonLibrary = {
  code: string;
};

export const pythonLibraryApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getPythonLibrary: builder.query<PythonLibrary, void>({
      query: () => ({
        url: "/api/ee/python-transform/user-modules/code",
        method: "GET",
      }),
    }),
    updatePythonLibrary: builder.mutation<void, PythonLibrary>({
      query: (body) => ({
        url: "/api/ee/python-transform/user-modules/code",
        method: "PUT",
        body,
      }),
    }),
  }),
});

export const { useGetPythonLibraryQuery, useUpdatePythonLibraryMutation } =
  pythonLibraryApi;
