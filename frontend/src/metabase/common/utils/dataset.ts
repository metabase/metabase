import type { Dataset } from "metabase-types/api";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";

export const canDownloadResults = (result?: Dataset) => {
  return (
    !!result?.data &&
    !result.error &&
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canDownloadResults(result)
  );
};
