export type EmbedModalType = "question-embed" | "dashboard-embed";
export type PublicLinkModalType =
  | "question-public-link"
  | "dashboard-public-link";

export type SharingModalType = PublicLinkModalType | EmbedModalType;
