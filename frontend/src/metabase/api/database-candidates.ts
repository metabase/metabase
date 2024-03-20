import { Api } from "metabase/api";
import type { DatabaseCandidate, DatabaseId } from "metabase-types/api";

// a "database candidate" is a set of sample x-rays we suggest for new users
export const databaseCandidatesApi = Api.injectEndpoints({
  endpoints: builder => ({
    listDatabaseCandidates: builder.query<
      DatabaseCandidate[],
      { id?: DatabaseId }
    >({
      query: ({ id }) => `/api/automagic-dashboards/database/${id}/candidates`,
    }),
  }),
});

export const { useListDatabaseCandidatesQuery } = databaseCandidatesApi;
