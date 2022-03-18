import { t } from "ttag";
import { Dataset } from "metabase-types/api/dataset";

export const canDownloadResults = (result: Dataset) =>
  result.data?.download_perms !== "none";

export const getDownloadWidgetMessageOverride = (result: Dataset) => {
  if (result.data?.download_perms === "limited") {
    return t`The maximum download size is 10 thousand rows.`;
  }

  return null;
};
