import { getEmbeddedAppSlugFromPath } from "embedding-sdk-shared/data-apps/embedded-data-app-path";
import { PLUGIN_DATA_APPS } from "metabase/plugins";

import type { SdkIframeEmbedSetupSettings } from "../types";

export type DataAppStatus = "loading" | "error" | "unavailable" | "available";

/**
 * Whether the selected data app can be embedded. Draft and outdated apps
 * cannot. Returns `null` when the settings are not for a data app.
 */
export const useDataAppStatus = (
  settings: SdkIframeEmbedSetupSettings,
): DataAppStatus | null => {
  const isDataApp = settings.componentName === "metabase-data-app";

  const {
    data: apps,
    isLoading,
    error,
  } = PLUGIN_DATA_APPS.useDataApps({ skip: !isDataApp });

  if (!isDataApp) {
    return null;
  }

  if (isLoading) {
    return "loading";
  }

  if (error) {
    return "error";
  }

  const appSlug = getEmbeddedAppSlugFromPath(settings.path);
  const selectedApp = apps?.find((app) => app.slug === appSlug);
  const isAvailable = !!selectedApp?.enabled && !selectedApp.outdated;

  return isAvailable ? "available" : "unavailable";
};
