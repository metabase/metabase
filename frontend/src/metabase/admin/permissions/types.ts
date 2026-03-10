import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import type { ReactElement, ReactNode } from "react";

import type { ColorName } from "metabase/lib/colors/types";
import type { IconName } from "metabase/ui";
import type { GroupId } from "metabase-types/api";
import type { State } from "metabase-types/store";

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

export function parseGroupRouteParams(
  raw: RawGroupRouteParams,
): GroupRouteParams {
  return {
    groupId: raw.groupId != null ? parseInt(raw.groupId) : undefined,
    databaseId: raw.databaseId != null ? parseInt(raw.databaseId) : undefined,
    schemaName: raw.schemaName,
  };
}

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

export function parseDataRouteParams(raw: RawDataRouteParams): DataRouteParams {
  return {
    databaseId: raw.databaseId != null ? parseInt(raw.databaseId) : undefined,
    schemaName: raw.schemaName,
    tableId: raw.tableId != null ? parseInt(raw.tableId) : undefined,
  };
}

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

export type DatabasePermissionsDiff = {
  name: string;
  grantedTables?: Record<number | string, { name: string }>;
  revokedTables?: Record<number | string, { name: string }>;
  native?: DataPermissionValue;
};

export type GroupPermissionsDiff = {
  name: string;
  databases: Record<number | string, DatabasePermissionsDiff>;
};

export type PermissionsGraphDiff = {
  groups: Record<number | string, GroupPermissionsDiff>;
};

export type PermissionSubject = "schemas" | "tables" | "fields";

export type SpecialGroupType = "admin" | "analyst" | "external" | null;

export interface PermissionOption {
  label: string;
  value: DataPermissionValue;
  icon: IconName;
  iconColor: ColorName;
}

export interface PermissionAction {
  label: string;
  icon: IconName;
  iconColor: ColorName;
  actionCreator: (
    entityId: EntityId | undefined,
    id: number,
    view: "database" | "group",
  ) => ThunkDispatch<State, unknown, UnknownAction>;
}

export interface PermissionConfirmationProps {
  title: string;
  message: string | ReactNode;
  confirmButtonText: string;
  cancelButtonText: string;
}

type PostActionFunction = (
  entityId: EntityId,
  groupId: GroupId,
  view: "database" | "group",
  value: DataPermissionValue,
  getState: () => State,
) => void;

export type PermissionSectionConfig = {
  permission: DataPermission;
  type: DataPermissionType;
  value: DataPermissionValue;
  isDisabled: boolean;
  disabledTooltip: string | null;
  isHighlighted?: boolean;
  warning?: string | null;
  toggleLabel?: string | null;
  toggleDefaultValue?: boolean | null;
  toggleDisabled?: boolean | null;
  hasChildren?: boolean;
  options: PermissionOption[];
  actions?: Partial<
    Record<DataPermissionValue, PermissionAction[] | undefined>
  >;
  postActions?: Partial<
    Record<DataPermissionValue, PostActionFunction | null | undefined>
  >;
  confirmations?: (
    newValue: DataPermissionValue,
  ) => (PermissionConfirmationProps | undefined)[];
};

// most entity ids are numbers, and many call sites expect a number, so here's a helper
export function assertNumericId(id: string | number): number {
  if (typeof id !== "number") {
    throw new Error(`Expected numeric PermissionEditorEntity id, got: ${id}`);
  }
  return id;
}

export interface PermissionEditorEntity {
  id: number | string; //schemas have string ids
  name: string;
  icon?: ReactElement;
  hint?: ReactNode;
  entityId?: EntityId;
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
  description?: string | null;
  filterPlaceholder: string;
  columns: { name: string; hint?: string }[];
  entities: PermissionEditorEntity[];
  breadcrumbs?: PermissionEditorBreadcrumb[] | null;
  hasLegacyNoSelfServiceValueInPermissionGraph?: boolean;
};
