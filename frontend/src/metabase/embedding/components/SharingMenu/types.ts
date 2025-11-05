import type { STATIC_LEGACY_EMBEDDING_TYPE } from "metabase/embedding/constants";

export type EmbedModalType = "question-embed" | "dashboard-embed";
export type PublicLinkModalType =
  | "question-public-link"
  | "dashboard-public-link";

export type QuestionSharingModalType =
  | "question-public-link"
  | "question-embed"
  | typeof STATIC_LEGACY_EMBEDDING_TYPE;

export type DashboardSharingModalType =
  | "dashboard-public-link"
  | "dashboard-embed"
  | typeof STATIC_LEGACY_EMBEDDING_TYPE;

export type SharingModalType = PublicLinkModalType | EmbedModalType;
