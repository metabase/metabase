import { EnterpriseApi } from "metabase-enterprise/api/api";
import type {
  CardId,
  DashboardId,
  DatabaseId,
  FieldId,
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
  /** Names the preview for `POST /preview/end`. */
  preview_id: string;
  user_id: number;
  user_name: string;
  principal_name: string;
  attributes: Record<string, string>;
};

export type PreviewSessionResponse = StartPreviewResponse & {
  /** Signs a request in as `user_id`, read-only, sent as `X-Metabase-Session`. */
  session_token: string;
  /** Epoch seconds. */
  expires_at: number;
};

export type PreviewCodeResponse = StartPreviewResponse & {
  /** The preview host session, for `POST /preview/end`; its key lives only in the preview host's cookie. */
  session_id: string;
  /** One use, until `code_expires_at` (epoch seconds): the frame trades it for the cookie. */
  code: string;
  code_expires_at: number;
  /** The preview host's origin, such as `http://preview.localhost:3000`. */
  preview_origin: string;
};

export type PreviewGrantResponse = StartPreviewResponse & {
  grant: string;
  /** Epoch seconds. */
  expires_at: number;
};

/** An attribute a group's access depends on, with the values to pick from. */
export type PreviewAttribute = {
  attribute: string;
  uses: string[];
  member_values: { value: string; count: number }[];
  other_values: string[];
  default: string | null;
};

export type AttributeRuleKind = "sandbox" | "impersonation" | "routing";

/** A security rule that reads an attribute. */
export type AttributeUse = {
  kind: AttributeRuleKind;
  label: string;
  table_id?: TableId;
  field_id?: FieldId;
  /** The filtered column, as `Table.Column`. */
  column?: string;
  database_id?: DatabaseId;
};

/** An attribute a security rule on a person's groups reads, with their value. */
export type AffectingAttribute = {
  attribute: string;
  value: string | null;
  uses: AttributeUse[];
  /** False when an opened item queries none of the tables and databases its rules cover. */
  applies: boolean;
  member_values?: { value: string; count: number }[];
  other_values?: string[];
  /** Where a user's value comes from; tenant < JWT < admin-set when more than one sets it. */
  source?: "tenant" | "jwt" | "admin";
  tenant_name?: string;
};

export type AffectingAttributesRequest = {
  principal: Principal;
  cardId?: CardId;
  dashboardId?: DashboardId;
};

function principalParams({ type, id }: Principal) {
  return { "principal-type": type, "principal-id": id };
}

const END_PREVIEW_URL = "/api/ee/permission_debug/preview/end";

function getEndPreviewBody(
  request: Principal,
  preview: StartPreviewResponse | PreviewSessionResponse | PreviewCodeResponse,
) {
  return {
    preview_id: preview.preview_id,
    user_id: preview.user_id,
    principal_type: request.type,
    principal_id: request.id,
    attributes: preview.attributes,
    session_token:
      "session_token" in preview ? preview.session_token : undefined,
    session_id: "session_id" in preview ? preview.session_id : undefined,
  };
}

/**
 * Ends a preview while the page goes away (a reload, a closed tab, a full navigation), when a normal request may be
 * cancelled: the same body as `endPreview`, sent with the admin's cookie.
 */
export function sendEndPreviewBeacon(
  request: Principal,
  preview: StartPreviewResponse | PreviewSessionResponse | PreviewCodeResponse,
) {
  navigator.sendBeacon(
    END_PREVIEW_URL,
    new Blob([JSON.stringify(getEndPreviewBody(request, preview))], {
      type: "application/json",
    }),
  );
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
    getAffectingAttributes: builder.query<
      AffectingAttribute[],
      AffectingAttributesRequest
    >({
      query: ({ principal, cardId, dashboardId }) => ({
        method: "GET",
        url: "/api/ee/permission_debug/preview/attributes",
        params: {
          [`${principal.type}_id`]: principal.id,
          card_id: cardId,
          dashboard_id: dashboardId,
        },
      }),
    }),
    endPreview: builder.mutation<
      void,
      {
        request: StartPreviewRequest;
        preview:
          | StartPreviewResponse
          | PreviewSessionResponse
          | PreviewCodeResponse;
      }
    >({
      query: ({ request, preview }) => ({
        method: "POST",
        url: END_PREVIEW_URL,
        body: getEndPreviewBody(request, preview),
      }),
    }),
    startPreviewSession: builder.mutation<
      PreviewSessionResponse,
      StartPreviewRequest
    >({
      query: ({ type, id, attributes }) => ({
        method: "POST",
        url: "/api/ee/permission_debug/preview/session",
        body: { principal_type: type, principal_id: id, attributes },
      }),
    }),
    startPreviewCode: builder.mutation<
      PreviewCodeResponse,
      StartPreviewRequest
    >({
      query: ({ type, id, attributes }) => ({
        method: "POST",
        url: "/api/ee/permission_debug/preview/code",
        body: { principal_type: type, principal_id: id, attributes },
      }),
    }),
    startPreview: builder.mutation<StartPreviewResponse, StartPreviewRequest>({
      query: ({ type, id, attributes }) => ({
        method: "POST",
        url: "/api/ee/permission_debug/preview/start",
        body: { principal_type: type, principal_id: id, attributes },
      }),
    }),
    issuePreviewGrant: builder.mutation<
      PreviewGrantResponse,
      StartPreviewRequest
    >({
      query: ({ type, id, attributes }) => ({
        method: "POST",
        url: "/api/ee/permission_debug/preview/grant",
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
  useGetAffectingAttributesQuery,
  useEndPreviewMutation,
  useStartPreviewMutation,
  useStartPreviewSessionMutation,
  useStartPreviewCodeMutation,
  useIssuePreviewGrantMutation,
} = permissionPreviewApi;
