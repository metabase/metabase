import type { ComponentType, FC, ReactNode } from "react";

import type {
  DataPermission,
  PermissionEntityId,
  TableId,
} from "metabase-types/api";

import { definePluginSlot } from "../slot";

export type ViewAsButtonProps = {
  entityName: string;
};

export type TableUsersPreviewProps = {
  tableId: TableId;
  /** Shown above the grid, such as the Groups | Preview toggle. */
  preHeaderContent?: FC;
};

/** A cell of a permissions grid: one entity's row in one permission's column. */
export type OutlinedGridCell = {
  entityId: PermissionEntityId;
  permission: DataPermission;
};

type PermissionPreviewPlugin = {
  /** Whether the Permissions tabs offer a read-only "Preview" of a user's, group's or tenant's effective access. */
  isEnabled: boolean;
  /** The Data tab's Preview routes, mounted under `data`. */
  getDataRoutes: () => ReactNode;
  /** The other tabs' Preview routes (`<tab>/preview/…`), mounted next to the tabs. */
  getTabRoutes: () => ReactNode;
  /** Tabs after every permissions tab, such as Troubleshoot. */
  tabs: { name: string; value: string }[];
  /** Every user's effective access to one table, shown on Databases › a table. */
  TableUsersPreview: ComponentType<TableUsersPreviewProps> | null;
  PermissionsToolbarButtons: ComponentType | null;
  ViewAsButton: ComponentType<ViewAsButtonProps> | null;
  PreviewBanner: ComponentType | null;
  /** The user this page previews as, for requests made without the API client (map tiles); null when not previewing. */
  getActivePreviewUserId: () => number | null;
  /** The cell a preview's "Show in grid" opened the grid at, outlined there; null otherwise. */
  useOutlinedGridCell: () => OutlinedGridCell | null;
  /** Whether a 403's body is a preview refusing a write, which the preview reports itself, not as a page error. */
  isReadOnlyRefusal: (body: unknown) => boolean;
};

const getDefaultPermissionPreview = (): PermissionPreviewPlugin => ({
  isEnabled: false,
  getDataRoutes: () => null,
  getTabRoutes: () => null,
  tabs: [],
  TableUsersPreview: null,
  PermissionsToolbarButtons: null,
  ViewAsButton: null,
  PreviewBanner: null,
  getActivePreviewUserId: () => null,
  useOutlinedGridCell: () => null,
  isReadOnlyRefusal: () => false,
});

export const PLUGIN_PERMISSION_PREVIEW = definePluginSlot(
  getDefaultPermissionPreview,
);
