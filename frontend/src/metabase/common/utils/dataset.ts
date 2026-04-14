import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type { Dataset } from "metabase-types/api";

export const canDownloadResults = (result?: Dataset) => {
  return (
    !!result?.data &&
    !result.error &&
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canDownloadResults(result)
  );
};
