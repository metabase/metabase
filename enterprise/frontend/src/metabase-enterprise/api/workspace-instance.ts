import type {
  TableRemapping,
  WorkspaceChangeSummary,
  WorkspaceInstance,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const workspaceInstanceApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getCurrentWorkspace: builder.query<WorkspaceInstance, void>({
      // STUB: returns mock workspace data without hitting the backend.
      // Replace this `queryFn` with the commented `query` below to read the real atom-backed endpoint.
      // query: () => ({ method: "GET", url: "/api/ee/workspace-instance/current" }),
      queryFn: async () => {
        const workspace: WorkspaceInstance = {
          name: "Acme Analytics",
          remappings_count: 5,
          databases: {
            1: {
              name: "Sample Postgres",
              input_schemas: ["public", "marketing"],
              output_schema: "analytics",
            },
            2: {
              name: "Warehouse",
              input_schemas: ["raw", "staging"],
              output_schema: "warehouse",
            },
            3: {
              name: "Events DB",
              input_schemas: ["ingest"],
              output_schema: "sandbox",
            },
          },
        };
        return { data: workspace };
      },
    }),
    getWorkspaceChangeSummary: builder.query<WorkspaceChangeSummary, void>({
      // STUB: returns mock change-summary data without hitting the backend.
      // Replace this `queryFn` with the commented `query` below to read the real endpoint.
      // query: () => ({ method: "GET", url: "/api/ee/workspace-instance/change-summary" }),
      queryFn: async () => {
        const summary: WorkspaceChangeSummary = {
          diverged_tables: [
            {
              id: 1,
              database_id: 1,
              table_id: 12,
              schema: "public",
              table_name: "orders",
              status: "modified",
              produced_by_transform_id: 101,
              produced_by_transform_name: "Orders v1",
              last_run_at: "2026-04-27T08:14:00Z",
              last_run_status: "succeeded",
              schema_drift: {
                added_columns: ["promo_code"],
                removed_columns: [],
                type_changed_columns: [],
              },
              dependents: [
                {
                  id: 505,
                  entity_type: "transform",
                  name: "Daily orders rollup",
                },
                {
                  id: 507,
                  entity_type: "question",
                  name: "Promo code uplift",
                },
                {
                  id: 508,
                  entity_type: "question",
                  name: "AOV by segment",
                },
                {
                  id: 509,
                  entity_type: "question",
                  name: "Refund rate",
                },
                {
                  id: 522,
                  entity_type: "metric",
                  name: "Average order value",
                },
              ],
            },
            {
              id: 2,
              database_id: 1,
              table_id: 11,
              schema: "public",
              table_name: "people",
              status: "modified",
              produced_by_transform_id: 102,
              produced_by_transform_name: "People dim",
              last_run_at: "2026-04-22T11:05:00Z",
              last_run_status: "succeeded",
              schema_drift: {
                added_columns: [],
                removed_columns: ["legacy_email"],
                type_changed_columns: [
                  { name: "tier", from_type: "text", to_type: "varchar(16)" },
                ],
              },
              dependents: [
                {
                  id: 503,
                  entity_type: "question",
                  name: "Top customers by LTV",
                },
                {
                  id: 504,
                  entity_type: "model",
                  name: "Customer 360",
                },
                {
                  id: 521,
                  entity_type: "metric",
                  name: "Active customers",
                },
                {
                  id: 530,
                  entity_type: "segment",
                  name: "Premium customers",
                },
                {
                  id: 540,
                  entity_type: "measure",
                  name: "Lifetime value",
                },
              ],
            },
            {
              id: 3,
              database_id: 2,
              table_id: 21,
              schema: "raw",
              table_name: "products",
              status: "new",
              produced_by_transform_id: 201,
              produced_by_transform_name: "Products mart",
              last_run_at: "2026-04-28T09:30:00Z",
              last_run_status: "succeeded",
              schema_drift: {
                added_columns: [],
                removed_columns: [],
                type_changed_columns: [],
              },
              dependents: [],
            },
            {
              id: 4,
              database_id: 2,
              table_id: 22,
              schema: "staging",
              table_name: "events",
              status: "modified",
              produced_by_transform_id: 202,
              produced_by_transform_name: "Events warehouse",
              last_run_at: "2026-04-12T17:42:00Z",
              last_run_status: "failed",
              schema_drift: {
                added_columns: [],
                removed_columns: [],
                type_changed_columns: [],
              },
              dependents: [
                {
                  id: 512,
                  entity_type: "question",
                  name: "Event volume by source",
                },
              ],
            },
            {
              id: 5,
              database_id: 3,
              table_id: 31,
              schema: "ingest",
              table_name: "sessions",
              status: "modified",
              produced_by_transform_id: 301,
              produced_by_transform_name: "Sessions sandbox",
              last_run_at: null,
              last_run_status: "never_run",
              schema_drift: {
                added_columns: [],
                removed_columns: [],
                type_changed_columns: [],
              },
              dependents: [
                {
                  id: 511,
                  entity_type: "transform",
                  name: "Active sessions daily",
                },
              ],
            },
          ],
        };
        return { data: summary };
      },
    }),
    listTableRemappings: builder.query<TableRemapping[], void>({
      // STUB: returns mock remappings without hitting the backend.
      // Replace this `queryFn` with the commented `query` below to read the real endpoint.
      // query: () => ({ method: "GET", url: "/api/ee/workspace-instance/remappings" }),
      queryFn: async () => {
        const remappings: TableRemapping[] = [
          {
            id: 1,
            database_id: 1,
            from_schema: "public",
            from_table_name: "orders",
            from_table_id: null,
            to_schema: "analytics",
            to_table_name: "orders_v1",
            to_table_id: null,
            created_at: "2026-04-01T12:00:00Z",
          },
          {
            id: 2,
            database_id: 1,
            from_schema: "public",
            from_table_name: "people",
            from_table_id: null,
            to_schema: "analytics",
            to_table_name: "people_v1",
            to_table_id: null,
            created_at: "2026-04-02T12:00:00Z",
          },
          {
            id: 3,
            database_id: 2,
            from_schema: "raw",
            from_table_name: "products",
            from_table_id: null,
            to_schema: "marts",
            to_table_name: "products_v1",
            to_table_id: null,
            created_at: "2026-04-03T12:00:00Z",
          },
          {
            id: 4,
            database_id: 2,
            from_schema: "staging",
            from_table_name: "events",
            from_table_id: null,
            to_schema: "warehouse",
            to_table_name: "events_v1",
            to_table_id: null,
            created_at: "2026-04-04T12:00:00Z",
          },
          {
            id: 5,
            database_id: 3,
            from_schema: "ingest",
            from_table_name: "sessions",
            from_table_id: null,
            to_schema: "sandbox",
            to_table_name: "sessions_v1",
            to_table_id: null,
            created_at: "2026-04-05T12:00:00Z",
          },
        ];
        return { data: remappings };
      },
    }),
  }),
});

export const {
  useGetCurrentWorkspaceQuery,
  useGetWorkspaceChangeSummaryQuery,
  useListTableRemappingsQuery,
} = workspaceInstanceApi;
