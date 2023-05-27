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

export type DataPermission = "data" | "download" | "data-model" | "details";

export type PermissionSubject = "schemas" | "tables" | "fields";

export type PermissionSectionConfig = {
  permission: string;
  type: string;
  isDisabled: boolean;
  disabledTooltip: string | null;
  isHighlighted: boolean;
  value: string;
  warning: string | null;
  options: {
    label: string;
    value: string;
    icon: string;
    iconColor: string;
  }[];
  actions: {
    controlled: {
      label: string;
      icon: string;
      iconColor: string;
      actionCreator: (...args: unknown[]) => void;
    }[];
  };
  postActions: {
    controlled: null | ((...args: unknown[]) => void);
  };
  confirmations: unknown[];
};
