import { DatasetQuery } from "./query";

export interface UnsavedCard {
  display: string;
  dataset_query: DatasetQuery;
  visualization_settings: VisualizationSettings;
}

export interface SavedCard extends UnsavedCard {
  id: CardId;
  name: string;
  description: string | null;
  dataset: boolean;
  can_write: boolean;
}

export type VisualizationSettings = {
  [key: string]: any;
};

export interface ModerationReview {
  moderator_id: number;
  status: ModerationReviewStatus | null;
  created_at: string;
  most_recent: boolean;
}

export type CardId = number;
export type ModerationReviewStatus = "verified";
