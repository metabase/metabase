import type { ComponentType, ReactNode } from "react";

import { definePluginSlot } from "../slot";

export type ViewAsButtonProps = {
  entityName: string;
};

type PermissionPreviewPlugin = {
  /** The tabs' routes, mounted next to the other permissions tabs. */
  getTabRoutes: () => ReactNode;
  /** Tabs after every permissions tab, such as Troubleshoot. */
  tabs: { name: string; value: string }[];
  PermissionsToolbarButtons: ComponentType | null;
  ViewAsButton: ComponentType<ViewAsButtonProps> | null;
  PreviewBanner: ComponentType | null;
  /** The user this page previews as, for requests made without the API client (map tiles); null when not previewing. */
  getActivePreviewUserId: () => number | null;
  /** Whether a 403's body is a preview refusing a write, which the preview reports itself, not as a page error. */
  isReadOnlyRefusal: (body: unknown) => boolean;
};

const getDefaultPermissionPreview = (): PermissionPreviewPlugin => ({
  getTabRoutes: () => null,
  tabs: [],
  PermissionsToolbarButtons: null,
  ViewAsButton: null,
  PreviewBanner: null,
  getActivePreviewUserId: () => null,
  isReadOnlyRefusal: () => false,
});

export const PLUGIN_PERMISSION_PREVIEW = definePluginSlot(
  getDefaultPermissionPreview,
);
