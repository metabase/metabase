import { Api } from "./api";

export interface StarRezStatus {
  configured: {
    api_url: boolean;
    api_username: boolean;
    api_token: boolean;
    blob_sas_url: boolean;
    pg_host: boolean;
    pg_user: boolean;
    pg_password: boolean;
  };
  settings: {
    export_tables: string;
    export_reports: string;
    sort_field: string;
    keep_versions: number;
    pg_database: string;
  };
}

export interface StarRezWeek {
  id: number;
  week_start: string;
  fetched_at: string;
  is_active: boolean;
  blob_files: Record<string, string>;
  notes: string | null;
}

export interface StarRezActivateResult {
  results?: { table: string; rows: number; cols: number }[];
  error?: string | null;
}

export interface StarRezExportFile {
  name: string;
  last_modified: string | null;
  size: string | null;
}

export interface StarRezExportItemResult {
  kind: "table" | "report";
  name: string;
  blob_name: string;
  records_count?: number;
  success: boolean;
}

export interface StarRezExportResult {
  results?: StarRezExportItemResult[];
  error?: string;
}

const starRezApi = Api.injectEndpoints({
  endpoints: builder => ({
    getStarRezStatus: builder.query<StarRezStatus, void>({
      query: () => ({ method: "GET", url: "/api/starrez/status" }),
      providesTags: ["starrez-status"],
    }),

    testStarRezConnection: builder.mutation<
      { ok: boolean; message?: string; error?: string },
      void
    >({
      query: () => ({ method: "POST", url: "/api/starrez/test" }),
    }),

    runStarRezExport: builder.mutation<StarRezExportResult, void>({
      query: () => ({
        method: "POST",
        url: "/api/starrez/export",
      }),
      invalidatesTags: ["starrez-exports"],
    }),

    listStarRezExports: builder.query<
      { exports: StarRezExportFile[]; error?: string },
      void
    >({
      query: () => ({ method: "GET", url: "/api/starrez/exports" }),
      providesTags: ["starrez-exports"],
    }),

    deleteStarRezExport: builder.mutation<{ success: boolean }, string>({
      query: blobName => ({
        method: "POST",
        url: "/api/starrez/exports/delete",
        body: { "blob-name": blobName },
      }),
      invalidatesTags: ["starrez-exports"],
    }),

    testStarRezDb: builder.mutation<
      { ok: boolean; message?: string; error?: string },
      void
    >({
      query: () => ({ method: "POST", url: "/api/starrez/db/test" }),
    }),

    listStarRezWeeks: builder.query<
      { weeks: StarRezWeek[]; error?: string },
      void
    >({
      query: () => ({ method: "GET", url: "/api/starrez/weeks" }),
      providesTags: ["starrez-weeks"],
    }),

    activateStarRezWeek: builder.mutation<StarRezActivateResult, number>({
      query: weekId => ({
        method: "POST",
        url: `/api/starrez/weeks/${weekId}/activate`,
      }),
      invalidatesTags: ["starrez-weeks"],
    }),
  }),
});

export const {
  useGetStarRezStatusQuery,
  useTestStarRezConnectionMutation,
  useRunStarRezExportMutation,
  useListStarRezExportsQuery,
  useDeleteStarRezExportMutation,
  useTestStarRezDbMutation,
  useListStarRezWeeksQuery,
  useActivateStarRezWeekMutation,
} = starRezApi;
