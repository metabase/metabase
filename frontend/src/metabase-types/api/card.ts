export type VisualizationSettings = {
  [key: string]: any;
};

export interface ModerationReview {
  moderator_id: number;
  status: ModerationReviewStatus | null;
  created_at: string;
  most_recent: boolean;
}

export type ModerationReviewStatus = "verified";
