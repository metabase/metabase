import type { Download } from "metabase-types/store";

export const isCompleted = (download: Download) =>
  download.status === "complete";
export const isErrored = (download: Download) => download.status === "error";
export const isInProgress = (download: Download) =>
  download.status === "in-progress";
