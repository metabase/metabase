import type { MetabotUploadedFile } from "metabase-types/api";

export type AttachmentDraftFile = {
  id: string;
  file: File;
} & (
  | { status: "pending" | "uploading" }
  | { status: "saved"; attachment: MetabotUploadedFile }
  | { status: "error"; message: string; ambiguous: boolean }
);

export type AttachmentDraft = {
  files: AttachmentDraftFile[];
  status: "idle" | "uploading" | "sending";
  error?: string;
};

export const EMPTY_ATTACHMENT_DRAFT: AttachmentDraft = {
  files: [],
  status: "idle",
};
