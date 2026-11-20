import { EnterpriseApi } from "metabase-enterprise/api/api";
import type {
  CardId,
  DashboardId,
  DatabaseId,
  FieldId,
  GroupId,
  GroupsPermissions,
  TableId,
  UserAttributeMap,
} from "metabase-types/api";

export type PrincipalType = "user" | "group";

export type Principal = {
  type: PrincipalType;
  id: number;
};

/**
 * Who to preview, with the admin's unsaved data permission edits kept with `unsavedEditsId`, if any. A user's
 * `previewId` reads the attribute values that preview runs with.
 */
export type PreviewDataRequest = Principal & {
  unsavedEditsId?: string;
  previewId?: string;
};

export type PreviewPrincipal = {
  type: PrincipalType;
  id: number;
  name: string;
  detail: string | null;
  /** A group's members. */
  member_count: number | null;
  superuser: boolean;
  tenant_side: boolean;
  attributes: UserAttributeMap | null;
  groups: { id: GroupId; name: string }[];
};

export type PrincipalListItem = {
  id: number;
  name: string;
  /** A user's tenant. */
  detail: string | null;
  /** A group's members. */
  member_count: number | null;
  tenant_side: boolean;
};

export type PreviewPrincipalsResponse = {
  users: (PrincipalListItem & { email: string | null; group_ids: GroupId[] })[];
  groups: (PrincipalListItem & { built_in: boolean })[];
};

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
  database_name: string;
  table_name: string;
  /** The rule's rows as a sentence; null for a filter on user attributes, which `filters` shows instead. */
  rows: string | null;
  /** The attributes the rule reads, one per filter; `each_member` for a group, whose members bring their own. */
  filters: {
    attribute: string;
    value: string | null;
    each_member: boolean;
    column: string | null;
  }[];
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
  /** Every group's rule that applies here, `security` being the first; two row and column security rules fail every query that reaches the table. */
  policies: PreviewSecurity[];
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

/** One unsaved edit on the permissions page, as "See changes" lists it: "Sample Database · Reviews · View data: Blocked → Can view". */
export type UnsavedEdit = {
  group_id: GroupId;
  group_name: string;
  database_id: DatabaseId;
  /** Set when the edit is on one table, unset when it's on the whole database. */
  table_id?: TableId;
  label: string;
  permission: string;
  before: string;
  after: string;
};

export type StartPreviewRequest = Principal & {
  /** A group's attribute values; an empty string means no value. */
  attributes?: Record<string, string>;
  /** Previews the admin's unsaved data permission edits kept with this id, as if they were saved. */
  unsavedEditsId?: string;
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

/** A question's or dashboard's collection and the tables and databases it queries; a native one queries a whole database. */
export type ItemDependencies = {
  name: string;
  collection_id: number | null;
  table_ids: TableId[];
  whole_database_ids: DatabaseId[];
  database_ids: DatabaseId[];
};

/** A permission check `GET /api/ee/permission_debug` runs as the user: opening an item, or running its queries. */
export type PermissionDebugActionType =
  | "card/read"
  | "card/query"
  | "dashboard/read"
  | "dashboard/query"
  | "collection/read";

export type PermissionDebugRequest = {
  userId: number;
  modelId: number;
  actionType: PermissionDebugActionType;
  /** The preview whose picked attribute values replace the user's own in the check. */
  previewId?: string;
};

/** A user attribute that a group's row and column security on a table reads, which the person lacks. */
export type MissingAttribute = {
  attribute: string;
  "table-id": TableId;
  "group-id": GroupId;
};

/** A database where the person's row and column security and a group's connection impersonation both apply, which fails every query on it. */
export type ConflictingDatabase = {
  "database-id": DatabaseId;
  "sandbox-group-ids": GroupId[];
  "impersonation-group-ids": GroupId[];
};

/** A user attribute the person lacks that a connection impersonation policy (of `group-id`) or a database's router reads. */
export type MissingDatabaseAttribute = {
  attribute: string;
  "database-id": DatabaseId;
  kind: "impersonation" | "routing";
  "group-id"?: GroupId;
};

export type PermissionDebugResponse = {
  decision: "allow" | "denied" | "limited";
  data: {
    /** A dashboard's cards, and how many of them can't load: a blocked table, a conflicting one, or a missing attribute. */
    "card-count"?: number;
    "blocked-card-count"?: number;
    /** The tables the queries reach that more than one group's row and column security applies to. */
    "conflicting-tables"?: TableId[];
    /** The attributes the person lacks that a rule on a table the queries reach reads. */
    "missing-attributes"?: MissingAttribute[];
    /** The databases the queries reach that fail every query on them, and the attributes their impersonation or routing reads that the person lacks. */
    "conflicting-databases"?: ConflictingDatabase[];
    "missing-database-attributes"?: MissingDatabaseAttribute[];
    /** Each card that can't load, with the names of its blocked tables, the ids of its conflicting ones and its missing attributes. */
    "blocked-cards"?: {
      id: number;
      name: string;
      tables: string[];
      "conflicting-tables"?: TableId[];
      "missing-attributes"?: MissingAttribute[];
      "conflicting-databases"?: ConflictingDatabase[];
      "missing-database-attributes"?: MissingDatabaseAttribute[];
    }[];
  };
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
    getDataPreview: builder.query<PreviewDataResponse, PreviewDataRequest>({
      query: ({ unsavedEditsId, previewId, ...principal }) => ({
        method: "GET",
        url: "/api/ee/permission_debug/preview/data",
        params: {
          ...principalParams(principal),
          "unsaved-edits-id": unsavedEditsId,
          "preview-id": previewId,
        },
      }),
    }),
    debugPermissions: builder.query<
      PermissionDebugResponse,
      PermissionDebugRequest
    >({
      query: ({ userId, modelId, actionType, previewId }) => ({
        method: "GET",
        url: "/api/ee/permission_debug",
        params: {
          user_id: userId,
          model_id: modelId,
          action_type: actionType,
          preview_id: previewId,
        },
      }),
    }),
    getTableUsersPreview: builder.query<
      PreviewTableUsersResponse,
      { tableId: TableId; unsavedEditsId?: string }
    >({
      query: ({ tableId, unsavedEditsId }) => ({
        method: "GET",
        url: `/api/ee/permission_debug/preview/table/${tableId}`,
        params: { "unsaved-edits-id": unsavedEditsId },
      }),
    }),
    createUnsavedEdits: builder.mutation<
      { unsaved_edits_id: string },
      { groups: GroupsPermissions; edits: UnsavedEdit[] }
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/permission_debug/preview/unsaved-edits",
        body,
      }),
    }),
    getUnsavedEdits: builder.query<{ edits: UnsavedEdit[] }, string>({
      query: (unsavedEditsId) => ({
        method: "GET",
        url: `/api/ee/permission_debug/preview/unsaved-edits/${unsavedEditsId}`,
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
    getItemDependencies: builder.query<
      ItemDependencies,
      { cardId?: CardId; dashboardId?: DashboardId }
    >({
      query: ({ cardId, dashboardId }) => ({
        method: "GET",
        url: "/api/ee/permission_debug/preview/item-scope",
        params: { card_id: cardId, dashboard_id: dashboardId },
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
      query: ({ type, id, attributes, unsavedEditsId }) => ({
        method: "POST",
        url: "/api/ee/permission_debug/preview/start",
        body: {
          principal_type: type,
          principal_id: id,
          attributes,
          unsaved_edits_id: unsavedEditsId,
        },
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
  useDebugPermissionsQuery,
  useGetTableUsersPreviewQuery,
  useCreateUnsavedEditsMutation,
  useGetUnsavedEditsQuery,
  useGetCollectionsPreviewQuery,
  useGetApplicationPreviewQuery,
  useGetAffectingAttributesQuery,
  useGetItemDependenciesQuery,
  useEndPreviewMutation,
  useStartPreviewMutation,
  useStartPreviewSessionMutation,
  useStartPreviewCodeMutation,
  useIssuePreviewGrantMutation,
} = permissionPreviewApi;
