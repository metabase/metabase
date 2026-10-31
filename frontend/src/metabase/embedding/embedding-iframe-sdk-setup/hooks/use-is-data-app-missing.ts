import { getEmbeddedAppNameFromPath } from "embedding-sdk-shared/lib/embedded-data-app-path";
import { PLUGIN_DATA_APPS } from "metabase/plugins";

import type { SdkIframeEmbedSetupSettings } from "../types";

export const useIsDataAppMissing = (
  settings: SdkIframeEmbedSetupSettings,
): boolean => {
  const isDataApp = settings.componentName === "metabase-data-app";

  const {
    data: apps,
    isLoading: isLoading,
    error: appListError,
  } = PLUGIN_DATA_APPS.useDataApps({ skip: !isDataApp });

  if (!isDataApp) {
    return false;
  }

  const appName = getEmbeddedAppNameFromPath(settings.path);
  const selectedApp = apps?.find((app) => app.name === appName);

  return (
    isLoading || !!appListError || !selectedApp?.enabled || selectedApp.outdated
  );
};
