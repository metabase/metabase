import { DatasetQuery } from "./query";

export interface Card extends UnsavedCard {
  id: CardId;
  name: string;
  description: string | null;
  dataset: boolean;
  can_write: boolean;
  cache_ttl: number | null;
  last_query_start: string | null;
  archived: boolean;

  creator?: {
    id: number;
    common_name: string;
    first_name: string;
    last_name: string;
    email: string;
    last_login: string;
    date_joined: string;
  };
}

export interface UnsavedCard {
  display: string;
  dataset_query: DatasetQuery;
  visualization_settings: VisualizationSettings;
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
