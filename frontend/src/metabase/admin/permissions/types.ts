import type { ReactElement, ReactNode } from "react";

import type Schema from "metabase-lib/v1/metadata/Schema";
import type { DatabaseId, TableId } from "metabase-types/api";

export type GroupRouteParams = {
  groupId?: number;
  databaseId?: number;
  schemaName?: string;
};

export type RawGroupRouteParams = {
  groupId?: string;
  databaseId?: string;
  schemaName?: string;
};

export type DataRouteParams = {
  databaseId?: number;
  schemaName?: string;
  tableId?: number;
};

export type RawDataRouteParams = {
  databaseId?: string;
  schemaName?: string;
  tableId?: string;
};

export type DatabaseEntityId = {
  databaseId: number;
};

export type SchemaEntityId = DatabaseEntityId & {
  schemaName: string | undefined;
};

export type TableEntityId = SchemaEntityId & {
  tableId: number;
};

export type EntityId = DatabaseEntityId &
  Partial<Omit<TableEntityId, "databaseId">>;

export type EntityWithGroupId = EntityId & { groupId: number };

export enum DataPermission {
  VIEW_DATA = "view-data",
  CREATE_QUERIES = "create-queries",
  DOWNLOAD = "download",
  DATA_MODEL = "data-model",
  DETAILS = "details",
  TRANSFORMS = "transforms",
  COLLECTIONS = "collections",
}

export enum DataPermissionType {
  ACCESS = "access",
  NATIVE = "native",
  DETAILS = "details",
  DOWNLOAD = "download",
  DATA_MODEL = "data-model",
  TRANSFORMS = "transforms",
  COLLECTIONS = "collections",
}

export enum DataPermissionValue {
  BLOCKED = "blocked",
  CONTROLLED = "controlled",
  IMPERSONATED = "impersonated",
  LEGACY_NO_SELF_SERVICE = "legacy-no-self-service",
  NO = "no",
  QUERY_BUILDER = "query-builder",
  QUERY_BUILDER_AND_NATIVE = "query-builder-and-native",
  SANDBOXED = "sandboxed",
  UNRESTRICTED = "unrestricted",
  // download specific values
  NONE = "none",
  LIMITED = "limited",
  FULL = "full",
  // details specific values
  YES = "yes",
  // data model specific values
  ALL = "all",
  //collections
  WRITE = "write",
  READ = "read",
  //NONE = "none", //shared with download above
}

export type PermissionSubject = "schemas" | "tables" | "fields";

export type SpecialGroupType = "admin" | "analyst" | "external" | null;

export interface PermissionOption {
  label: string;
  value: DataPermissionValue;
  //todo this should be IconName but would require updating a lot of call sites
  icon: string;
  //todo this should be ColorName but would require updating a lot of call sites
  iconColor: string;
}

export interface PermissionAction {
  label: string;
  icon: string;
  iconColor: string;
  actionCreator: (...args: unknown[]) => void;
}

export interface PermissionConfirmationProps {
  title: string;
  message: string | ReactNode;
  confirmButtonText: string;
  cancelButtonText: string;
}

export type PermissionSectionConfig = {
  permission: DataPermission;
  type: DataPermissionType;
  value: DataPermissionValue;
  isDisabled: boolean;
  disabledTooltip: string | null;
  isHighlighted?: boolean;
  warning?: string | null;
  toggleLabel?: string | null;
  hasChildren?: boolean;
  options: PermissionOption[];
  actions?: Partial<
    Record<DataPermissionValue, PermissionAction[] | undefined>
  >;
  postActions?: Partial<
    Record<
      DataPermissionValue,
      ((...args: unknown[]) => void) | null | undefined
    >
  >;
  confirmations?: (
    newValue: DataPermissionValue,
  ) => (PermissionConfirmationProps | undefined)[];
};

export interface PermissionEditorEntity {
  id: number;
  name: string;
  icon?: ReactElement;
  hint?: ReactNode;
  entityId?: {
    databaseId?: DatabaseId;
    schemaName?: Schema["name"];
    tableId?: TableId;
  };
  permissions?: PermissionSectionConfig[];
  canSelect?: boolean;
  callout?: string;
}

export type PermissionEditorBreadcrumb = {
  id?: number | string;
  text: string;
  subtext?: string;
  url?: string;
};

export type PermissionEditorType = {
  title: string;
  filterPlaceholder: string;
  columns: { name: string; hint?: string }[];
  entities: PermissionEditorEntity[];
  breadcrumbs?: PermissionEditorBreadcrumb[] | null;
};
