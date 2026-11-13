import type { ComponentType, FC, ReactNode } from "react";

import type { TableId } from "metabase-types/api";

import { definePluginSlot } from "../slot";

export type ViewAsButtonProps = {
  entityName: string;
};

export type TableUsersPreviewProps = {
  tableId: TableId;
  /** Shown above the grid, such as the Groups | Preview toggle. */
  preHeaderContent?: FC;
};

type PermissionPreviewPlugin = {
  /** Whether the Permissions tabs offer a read-only "Preview" of a user's, group's or tenant's effective access. */
  isEnabled: boolean;
  /** The Data tab's Preview routes, mounted under `data`. */
  getDataRoutes: () => ReactNode;
  /** The other tabs' Preview routes (`<tab>/preview/…`), mounted next to the tabs. */
  getTabRoutes: () => ReactNode;
  /** Every user's effective access to one table, shown on Databases › a table. */
  TableUsersPreview: ComponentType<TableUsersPreviewProps> | null;
  PermissionsToolbarButtons: ComponentType | null;
  ViewAsButton: ComponentType<ViewAsButtonProps> | null;
  PreviewBanner: ComponentType | null;
};

const getDefaultPermissionPreview = (): PermissionPreviewPlugin => ({
  isEnabled: false,
  getDataRoutes: () => null,
  getTabRoutes: () => null,
  TableUsersPreview: null,
  PermissionsToolbarButtons: null,
  ViewAsButton: null,
  PreviewBanner: null,
});

export const PLUGIN_PERMISSION_PREVIEW = definePluginSlot(
  getDefaultPermissionPreview,
);
