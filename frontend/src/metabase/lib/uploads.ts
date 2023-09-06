import type { FileUpload } from "metabase-types/store/upload";

export const isUploadInProgress = (upload: FileUpload) =>
  upload.status === "in-progress";

export const isUploadCompleted = (upload: FileUpload) =>
  upload.status === "complete";

export const isUploadAborted = (upload: FileUpload) =>
  upload.status === "error";
