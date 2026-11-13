import { t } from "ttag";

import { PLUGIN_API } from "metabase/api/client";
import {
  PLUGIN_ADMIN_PERMISSIONS_TABS,
  PLUGIN_PERMISSION_PREVIEW,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { PermissionsToolbarButtons } from "./PermissionsToolbarButtons";
import { PreviewBanner } from "./PreviewBanner";
import { ViewAsButton } from "./ViewAsButton";
import {
  getActivePreviewToken,
  getActivePreviewUserId,
  getPreviewAsHeaderHandler,
  getPreviewTokenHandler,
  isCookieFramePreview,
  readFramePreviewState,
  readPreviewState,
} from "./preview-state";
import { TableUsersPreview } from "./preview/TableUsersPreview";
import { getDataRoutes, getTabRoutes } from "./preview/routes";

/**
 * The Permissions Preview views and view-as, on the same `advanced_permissions` feature the backend gates them on.
 */
export function initializePlugin() {
  if (!hasPremiumFeature("advanced_permissions")) {
    return;
  }

  PLUGIN_PERMISSION_PREVIEW.getActivePreviewUserId = getActivePreviewUserId;
  PLUGIN_PERMISSION_PREVIEW.getActivePreviewToken = getActivePreviewToken;

  // The host page around the frame shows who is previewed, so the frame has no banner.
  const framePreviewState = readFramePreviewState();
  if (framePreviewState != null) {
    PLUGIN_API.onBeforeRequestHandlers.setPreviewAsHeader =
      isCookieFramePreview()
        ? getPreviewTokenHandler()
        : getPreviewAsHeaderHandler(framePreviewState);
    return;
  }

  const previewState = readPreviewState();

  if (previewState != null) {
    PLUGIN_API.onBeforeRequestHandlers.setPreviewAsHeader =
      getPreviewAsHeaderHandler(previewState);
    PLUGIN_PERMISSION_PREVIEW.PreviewBanner = function PreviewBannerSlot() {
      return <PreviewBanner state={previewState} />;
    };
    return;
  }

  PLUGIN_ADMIN_PERMISSIONS_TABS.tabs.push({
    name: t`Troubleshoot`,
    value: "troubleshoot",
  });
  PLUGIN_PERMISSION_PREVIEW.isEnabled = true;
  PLUGIN_PERMISSION_PREVIEW.getDataRoutes = getDataRoutes;
  PLUGIN_PERMISSION_PREVIEW.getTabRoutes = getTabRoutes;
  PLUGIN_PERMISSION_PREVIEW.TableUsersPreview = TableUsersPreview;
  PLUGIN_PERMISSION_PREVIEW.PermissionsToolbarButtons =
    PermissionsToolbarButtons;
  PLUGIN_PERMISSION_PREVIEW.ViewAsButton = ViewAsButton;
}
