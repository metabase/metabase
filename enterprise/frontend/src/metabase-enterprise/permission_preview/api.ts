import { EnterpriseApi } from "metabase-enterprise/api/api";
import type {
  DatabaseId,
  GroupId,
  TableId,
  UserAttributeMap,
} from "metabase-types/api";

export type PrincipalType = "user" | "group" | "tenant";

export type Principal = {
  type: PrincipalType;
  id: number;
};

export type PreviewPrincipal = {
  type: PrincipalType;
  id: number;
  name: string;
  detail: string;
  superuser: boolean;
  tenant_side: boolean;
  attributes: UserAttributeMap | null;
  groups: { id: GroupId; name: string }[];
};

export type PrincipalListItem = {
  id: number;
  name: string;
  detail: string;
  tenant_side: boolean;
};

export type PreviewPrincipalsResponse = Record<
  "users" | "groups" | "tenants",
  PrincipalListItem[]
>;

/** One resolved value: the winning group's value, and each group's own. */
export type PreviewCell = {
  value: string;
  group_id: GroupId | null;
  groups: { group_id: GroupId; name: string; value: string }[];
  note: string | null;
};

export type PreviewSecurity = {
  kind: "sandbox" | "impersonation";
  group_id: GroupId;
  group_name: string;
  rows: string;
  columns: string;
};

export type PreviewTableAccess = {
  id: TableId;
  schema: string | null;
  name: string;
  display_name: string | null;
  view_data: PreviewCell;
  create_queries: PreviewCell;
  download_results: PreviewCell;
  manage_table_metadata: PreviewCell;
  security: PreviewSecurity | null;
};

export type PreviewDatabase = {
  id: DatabaseId;
  name: string;
  reasons: string[];
  manage_database: PreviewCell;
  transforms: PreviewCell;
  tables: PreviewTableAccess[];
};

export type PreviewDataResponse = {
  principal: PreviewPrincipal;
  databases: PreviewDatabase[];
};

export type PreviewTableUsersResponse = {
  table: {
    id: TableId;
    db_id: DatabaseId;
    database_name: string;
    schema: string | null;
    name: string;
    display_name: string | null;
  };
  users: { principal: PreviewPrincipal; access: PreviewTableAccess }[];
};

export type CollectionNamespace = "default" | "shared" | "tenant";

export type PreviewCollection = {
  id: "root" | number | null;
  name: string;
  depth: number;
  source: "group" | "personal" | "tenant" | "other-tenant";
  access: PreviewCell;
};

export type PreviewCollectionsResponse = {
  principal: PreviewPrincipal;
  applies: boolean;
  reason: string | null;
  collections: PreviewCollection[];
};

export type ApplicationPermissionKey =
  | "setting"
  | "monitoring"
  | "subscription";

export type PreviewApplicationResponse = {
  principal: PreviewPrincipal;
  applies: boolean;
  reason: string | null;
  permissions: { key: ApplicationPermissionKey; access: PreviewCell }[];
};

export type StartPreviewRequest = Principal & {
  /** A group's attribute values; an empty string means no value. */
  attributes?: Record<string, string>;
};

export type StartPreviewResponse = {
  user_id: number;
  user_name: string;
  principal_name: string;
  attributes: Record<string, string>;
};

/** An attribute a group's access depends on, with the values to pick from. */
export type PreviewAttribute = {
  attribute: string;
  uses: string[];
  member_values: { value: string; count: number }[];
  other_values: string[];
  default: string | null;
};

function principalParams({ type, id }: Principal) {
  return { "principal-type": type, "principal-id": id };
}

const permissionPreviewApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listPreviewPrincipals: builder.query<PreviewPrincipalsResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/permission_debug/preview/principals",
      }),
    }),
    getDataPreview: builder.query<PreviewDataResponse, Principal>({
      query: (principal) => ({
        method: "GET",
        url: "/api/ee/permission_debug/preview/data",
        params: principalParams(principal),
      }),
    }),
    getTableUsersPreview: builder.query<PreviewTableUsersResponse, TableId>({
      query: (tableId) => ({
        method: "GET",
        url: `/api/ee/permission_debug/preview/table/${tableId}`,
      }),
    }),
    getCollectionsPreview: builder.query<
      PreviewCollectionsResponse,
      { principal: Principal; namespace: CollectionNamespace }
    >({
      query: ({ principal, namespace }) => ({
        method: "GET",
        url: "/api/ee/permission_debug/preview/collections",
        params: { ...principalParams(principal), namespace },
      }),
    }),
    getApplicationPreview: builder.query<PreviewApplicationResponse, Principal>(
      {
        query: (principal) => ({
          method: "GET",
          url: "/api/ee/permission_debug/preview/application",
          params: principalParams(principal),
        }),
      },
    ),
    getPreviewAttributes: builder.query<PreviewAttribute[], GroupId>({
      query: (groupId) => ({
        method: "GET",
        url: "/api/ee/permission_debug/preview/attributes",
        params: { "group-id": groupId },
      }),
    }),
    startPreview: builder.mutation<StartPreviewResponse, StartPreviewRequest>({
      query: ({ type, id, attributes }) => ({
        method: "POST",
        url: "/api/ee/permission_debug/preview/start",
        body: { principal_type: type, principal_id: id, attributes },
      }),
    }),
  }),
});

export const {
  useListPreviewPrincipalsQuery,
  useGetDataPreviewQuery,
  useGetTableUsersPreviewQuery,
  useGetCollectionsPreviewQuery,
  useGetApplicationPreviewQuery,
  useGetPreviewAttributesQuery,
  useStartPreviewMutation,
} = permissionPreviewApi;
