import { getEmbeddedAppSlugFromPath } from "embedding-sdk-shared/data-apps/embedded-data-app-path";
import { PLUGIN_DATA_APPS } from "metabase/plugins";

import type { SdkIframeEmbedSetupSettings } from "../types";

export type DataAppStatus = "loading" | "unavailable" | "available";

/**
 * Whether the selected data app can be embedded. Draft, outdated and removed
 * apps cannot, and neither can any app when the app list fails to load.
 * `status` is `null` and `isDataAppMissing` is `false` when the settings are
 * not for a data app.
 */
export const useDataAppStatus = (
  settings: SdkIframeEmbedSetupSettings,
): { status: DataAppStatus | null; isDataAppMissing: boolean } => {
  const status = useStatus(settings);

  return {
    status,
    isDataAppMissing: status !== null && status !== "available",
  };
};

const useStatus = (
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

  const appSlug = getEmbeddedAppSlugFromPath(settings.path);
  const selectedApp = apps?.find((app) => app.slug === appSlug);
  const isAvailable = !error && !!selectedApp?.enabled && !selectedApp.outdated;

  return isAvailable ? "available" : "unavailable";
};
