export type EmbedModalType = "question-embed" | "dashboard-embed";
export type PublicLinkModalType =
  | "question-public-link"
  | "dashboard-public-link";

export type QuestionSharingModalType =
  | "question-public-link"
  | "question-embed"
  | "question-alert";

export type DashboardSharingModalType =
  | "dashboard-public-link"
  | "dashboard-embed";

export type SharingModalType = PublicLinkModalType | EmbedModalType;
