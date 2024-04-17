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
}

export enum DataPermissionType {
  ACCESS = "access",
  NATIVE = "native",
  DETAILS = "details",
  DOWNLOAD = "download",
  DATA_MODEL = "data-model",
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
}

export type PermissionSubject = "schemas" | "tables" | "fields";

export type PermissionSectionConfig = {
  permission: DataPermission;
  type: DataPermissionType;
  value: DataPermissionValue;
  isDisabled: boolean;
  disabledTooltip: string | null;
  isHighlighted: boolean;
  warning?: string | null;
  options: {
    label: string;
    value: string;
    icon: string;
    iconColor: string;
  }[];
  actions?: Partial<
    Record<
      DataPermissionValue,
      | {
          label: string;
          icon: string;
          iconColor: string;
          actionCreator: (...args: unknown[]) => void;
        }[]
      | undefined
    >
  >;
  postActions?: Partial<
    Record<
      DataPermissionValue,
      ((...args: unknown[]) => void) | null | undefined
    >
  >;
  confirmations?: (newValue: DataPermissionValue) => (
    | {
        title: string;
        message: string;
        confirmButtonText: string;
        cancelButtonText: string;
      }
    | undefined
  )[];
};
