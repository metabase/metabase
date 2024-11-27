import type { BaseUser } from "./user";

export type VerifyItemRequest = {
  status: "verified" | null;
  moderated_item_id: number;
  moderated_item_type: "card" | "dashboard";
  text?: string;
};

export type ModerationReviewStatus = "verified" | null;

export type ModerationReview = {
  status: ModerationReviewStatus;
  moderator_id: number;
  created_at: string;
  most_recent?: boolean;
  user: BaseUser;
};
