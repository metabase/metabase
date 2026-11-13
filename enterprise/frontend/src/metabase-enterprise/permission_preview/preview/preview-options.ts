import { t } from "ttag";

import {
  COLLECTION_OPTIONS,
  type PermissionOption,
  type PermissionSectionConfig,
} from "metabase/permissions";
import {
  DataPermission,
  DataPermissionType,
  DataPermissionValue,
} from "metabase-types/api";

/** What a preview value means: a column of the preview grids, and the values the backend returns for it. */
export type PreviewColumn =
  | "view_data"
  | "create_queries"
  | "download_results"
  | "manage_table_metadata"
  | "manage_database"
  | "transforms"
  | "collection"
  | "application";

const YES_OPTION: PermissionOption = {
  get label() {
    return t`Yes`;
  },
  value: DataPermissionValue.YES,
  icon: "check",
  iconColor: "feedback-positive",
};

const NO_OPTION: PermissionOption = {
  get label() {
    return t`No`;
  },
  value: DataPermissionValue.NO,
  icon: "close",
  iconColor: "feedback-negative",
};

const YES_NO_OPTIONS: Record<string, PermissionOption> = {
  yes: YES_OPTION,
  no: NO_OPTION,
};

const OPTIONS_BY_COLUMN: Record<
  PreviewColumn,
  Record<string, PermissionOption>
> = {
  view_data: {
    unrestricted: {
      get label() {
        return t`Can view`;
      },
      value: DataPermissionValue.UNRESTRICTED,
      icon: "eye",
      iconColor: "feedback-positive",
    },
    sandboxed: {
      get label() {
        return t`Row and column security`;
      },
      value: DataPermissionValue.SANDBOXED,
      icon: "permissions_limited",
      iconColor: "core-brand",
    },
    impersonated: {
      get label() {
        return t`Impersonated`;
      },
      value: DataPermissionValue.IMPERSONATED,
      icon: "database",
      iconColor: "feedback-warning",
    },
    blocked: {
      get label() {
        return t`Blocked`;
      },
      value: DataPermissionValue.BLOCKED,
      icon: "close",
      iconColor: "feedback-negative",
    },
    "legacy-no-self-service": {
      get label() {
        return t`No self-service (Deprecated)`;
      },
      value: DataPermissionValue.LEGACY_NO_SELF_SERVICE,
      icon: "eye_crossed_out",
      iconColor: "accent5",
    },
  },
  create_queries: {
    "query-builder-and-native": {
      get label() {
        return t`Query builder and native`;
      },
      value: DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
      icon: "check",
      iconColor: "feedback-positive",
    },
    "query-builder": {
      get label() {
        return t`Query builder only`;
      },
      value: DataPermissionValue.QUERY_BUILDER,
      icon: "permissions_limited",
      iconColor: "feedback-warning",
    },
    no: NO_OPTION,
  },
  download_results: {
    "one-million-rows": {
      get label() {
        return t`1 million rows`;
      },
      value: DataPermissionValue.FULL,
      icon: "1m",
      iconColor: "accent7",
    },
    "ten-thousand-rows": {
      get label() {
        return t`10 thousand rows`;
      },
      value: DataPermissionValue.LIMITED,
      icon: "10k",
      iconColor: "accent7",
    },
    no: NO_OPTION,
  },
  manage_table_metadata: YES_NO_OPTIONS,
  manage_database: YES_NO_OPTIONS,
  transforms: YES_NO_OPTIONS,
  collection: COLLECTION_OPTIONS,
  application: YES_NO_OPTIONS,
};

const GRANULAR_OPTION: PermissionOption = {
  get label() {
    return t`Granular`;
  },
  value: DataPermissionValue.CONTROLLED,
  icon: "permissions_limited",
  iconColor: "feedback-warning",
};

/** The option the permission grids show for a preview value; `null` stands for "differs between tables". */
export function getPreviewOption(
  column: PreviewColumn,
  value: string | null,
): PermissionOption {
  if (value == null) {
    return GRANULAR_OPTION;
  }
  return OPTIONS_BY_COLUMN[column][value] ?? NO_OPTION;
}

// The grid keys a row's cells by `type`, so each column needs its own.
const PERMISSION_BY_COLUMN: Record<
  PreviewColumn,
  Pick<PermissionSectionConfig, "permission" | "type">
> = {
  view_data: {
    permission: DataPermission.VIEW_DATA,
    type: DataPermissionType.ACCESS,
  },
  create_queries: {
    permission: DataPermission.CREATE_QUERIES,
    type: DataPermissionType.NATIVE,
  },
  download_results: {
    permission: DataPermission.DOWNLOAD,
    type: DataPermissionType.DOWNLOAD,
  },
  manage_table_metadata: {
    permission: DataPermission.DATA_MODEL,
    type: DataPermissionType.DATA_MODEL,
  },
  manage_database: {
    permission: DataPermission.DETAILS,
    type: DataPermissionType.DETAILS,
  },
  transforms: {
    permission: DataPermission.TRANSFORMS,
    type: DataPermissionType.TRANSFORMS,
  },
  collection: {
    permission: DataPermission.COLLECTIONS,
    type: DataPermissionType.ACCESS,
  },
  application: {
    permission: DataPermission.DETAILS,
    type: DataPermissionType.ACCESS,
  },
};

/** A read-only grid cell: clicking the value calls `onValueClick` instead of opening the options. */
export function getPreviewSection(
  column: PreviewColumn,
  value: string | null,
  onValueClick: () => void,
): PermissionSectionConfig {
  const option = getPreviewOption(column, value);
  return {
    ...PERMISSION_BY_COLUMN[column],
    value: option.value,
    options: [option],
    isDisabled: false,
    disabledTooltip: null,
    onValueClick,
  };
}

export function getPreviewColumnName(column: PreviewColumn): string {
  switch (column) {
    case "view_data":
      return t`View data`;
    case "create_queries":
      return t`Create queries`;
    case "download_results":
      return t`Download results`;
    case "manage_table_metadata":
      return t`Manage table metadata`;
    case "manage_database":
      return t`Manage database`;
    case "transforms":
      return t`Transforms`;
    case "collection":
      return t`Collection access`;
    case "application":
      return t`Access`;
  }
}
