import type { CollectionId, TableId } from "metabase-types/api";

export enum UploadMode {
  append = "append",
  create = "create",
  replace = "replace",
}

export type FileUpload = {
  status: "complete" | "in-progress" | "error";
  name: string;
  collectionId?: CollectionId;
  modelId?: string;
  tableId?: TableId;
  message?: string;
  error?: string;
  uploadMode?: UploadMode;
  id: number;
};

export type FileUploadState = Record<string, FileUpload>;
