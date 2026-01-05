import type { GUEST_EMBED_EMBEDDING_TYPE } from "metabase/embedding/constants";

export type EmbedModalType = "question-embed" | "dashboard-embed";
export type PublicLinkModalType =
  | "question-public-link"
  | "dashboard-public-link";

export type QuestionSharingModalType =
  | "question-public-link"
  | typeof GUEST_EMBED_EMBEDDING_TYPE;

export type DashboardSharingModalType =
  | "dashboard-public-link"
  | typeof GUEST_EMBED_EMBEDDING_TYPE;

export type SharingModalType = PublicLinkModalType | EmbedModalType;
