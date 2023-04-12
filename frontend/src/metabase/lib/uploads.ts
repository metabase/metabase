import { FileUpload } from "metabase-types/store/upload";

export const uploadInProgress = (upload: FileUpload) =>
  upload.status === "in-progress";

export const uploadCompleted = (upload: FileUpload) =>
  upload.status === "complete";

export const uploadAborted = (upload: FileUpload) => upload.status === "error";
