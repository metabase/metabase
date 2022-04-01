import { t } from "ttag";
import { Dataset } from "metabase-types/api/dataset";

export const canDownloadResults = (result: Dataset) =>
  result.data?.download_perms !== "none";

export const getDownloadWidgetMessageOverride = (result: Dataset) => {
  if (result.data?.download_perms === "limited") {
    return t`You have permission to download up to 10 thousand rows.`;
  }

  return null;
};
