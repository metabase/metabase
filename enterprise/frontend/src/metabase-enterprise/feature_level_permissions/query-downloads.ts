import { t } from "ttag";
import type { Dataset } from "metabase-types/api/dataset";

export const canDownloadResults = (result: Dataset) =>
  result.data?.download_perms !== "no";

export const getDownloadWidgetMessageOverride = (result: Dataset) => {
  if (result.data?.download_perms === "ten-thousand-rows") {
    return t`You're allowed to download up to 10,000 rows.`;
  }

  return null;
};
