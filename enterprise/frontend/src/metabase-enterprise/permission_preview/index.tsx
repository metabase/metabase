import { t } from "ttag";

import { PLUGIN_API } from "metabase/api/client";
import { PLUGIN_PERMISSION_PREVIEW } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { PreviewBanner } from "./PreviewBanner";
import { ReadOnlyToast, isReadOnlyRefusal } from "./ReadOnlyToast";
import { ViewAsButton } from "./ViewAsButton";
import {
  getActivePreviewUserId,
  getPreviewAsHeaderHandler,
  readFramePreviewState,
  readPreviewState,
  restartStoredPreview,
} from "./preview-state";
import { getTabRoutes } from "./troubleshoot/routes";

/**
 * The Permissions Preview views and view-as, on the same `advanced_permissions` feature the backend gates them on.
 */
export function initializePlugin() {
  if (!hasPremiumFeature("advanced_permissions")) {
    return;
  }

  PLUGIN_PERMISSION_PREVIEW.getActivePreviewUserId = getActivePreviewUserId;
  PLUGIN_PERMISSION_PREVIEW.isReadOnlyRefusal = isReadOnlyRefusal;

  // The host page around the frame shows who is previewed, so the frame has no banner, only the read-only toast.
  const framePreviewState = readFramePreviewState();
  if (framePreviewState != null) {
    PLUGIN_API.onBeforeRequestHandlers.setPreviewAsHeader =
      getPreviewAsHeaderHandler(framePreviewState);
    PLUGIN_PERMISSION_PREVIEW.PreviewBanner = ReadOnlyToast;
    return;
  }

  const previewState = readPreviewState();

  if (previewState != null) {
    PLUGIN_API.onBeforeRequestHandlers.setPreviewAsHeader =
      getPreviewAsHeaderHandler(
        previewState,
        restartStoredPreview(previewState),
      );
    PLUGIN_PERMISSION_PREVIEW.PreviewBanner = function PreviewBannerSlot() {
      return (
        <>
          <ReadOnlyToast />
          <PreviewBanner state={previewState} />
        </>
      );
    };
    return;
  }

  PLUGIN_PERMISSION_PREVIEW.tabs = [
    { name: t`Preview access`, value: "troubleshoot" },
  ];
  PLUGIN_PERMISSION_PREVIEW.getTabRoutes = getTabRoutes;
  PLUGIN_PERMISSION_PREVIEW.ViewAsButton = ViewAsButton;
}
