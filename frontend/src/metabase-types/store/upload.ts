import { CollectionId } from "metabase-types/api";

export type FileUpload = {
  status: "complete" | "in-progress" | "error";
  name: string;
  collectionId: CollectionId;
  modelId?: string;
  message?: string;
  error?: string;
  id: number;
};

export type FileUploadState = Record<string, FileUpload>;
